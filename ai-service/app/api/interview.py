"""
Interview Router
Defines API endpoints for question generation and answer evaluation.
"""

from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from typing import Optional, List
import os
import random
from app.services.groq_service import call_groq, parse_response, to_float
from app.services.whisper_service import whisper_service
from app.prompts import (
    GENERATION_SYSTEM_PROMPT,
    EVALUATION_SYSTEM_PROMPT_CODING,
    EVALUATION_SYSTEM_PROMPT_CONCEPTUAL,
    EVALUATION_SYSTEM_PROMPT_SYSTEM_DESIGN,
    FOLLOWUP_SYSTEM_PROMPT,
    get_generation_user_prompt,
    get_evaluation_user_prompt_coding,
    get_evaluation_user_prompt_conceptual,
    get_evaluation_user_prompt_system_design,
    get_followup_user_prompt,
)

router = APIRouter()


class QuestionRequest(BaseModel):
    role: str = Field(default="Full-Stack Developer", max_length=100)
    level: str = Field(default="Junior", max_length=50)
    count: int = Field(default=5, gt=0, le=20)
    interview_type: str = Field(default="coding-mix", max_length=50)
    company: Optional[str] = Field(default=None, max_length=100)
    company_track: Optional[str] = Field(default=None, max_length=100)
    resume_text: Optional[str] = Field(default=None, max_length=20000)


class QuestionItem(BaseModel):
    question: str
    ideal_answer: str
    question_type: str = Field(default="oral", description="Must be 'coding' or 'oral'")


class QuestionResponse(BaseModel):
    questions: List[QuestionItem]
    model_used: str


class EvaluationRequest(BaseModel):
    question: str = Field(..., max_length=2000)
    question_type: str = Field(..., max_length=50)
    role: str = Field(default="Full-Stack Developer", max_length=100)
    level: Optional[str] = Field(default=None, max_length=50)
    user_answer: Optional[str] = Field(default=None, max_length=50000)
    user_code: Optional[str] = Field(default=None, max_length=50000)
    selected_language: Optional[str] = Field(default=None, max_length=50)
    diagram_payload: Optional[str] = Field(default=None, max_length=50000)


class EvaluationResponse(BaseModel):
    technical_score: float
    confidence_score: float
    ai_feedback: str
    ideal_answer: str


class FollowUpRequest(BaseModel):
    question: str = Field(..., max_length=2000)
    user_answer: Optional[str] = Field(default="", max_length=50000)
    ai_feedback: Optional[str] = Field(default="", max_length=5000)
    role: str = Field(default="Full-Stack Developer", max_length=100)
    level: str = Field(default="Junior", max_length=50)


class FollowUpResponse(BaseModel):
    question: str
    ideal_answer: str
    question_type: str = "oral"


@router.post("/generate-questions", response_model=QuestionResponse)
def generate_questions(req: QuestionRequest):
    """
    Generate multiple unique interview questions using the Groq LLM.
    Handles partitioning between coding and conceptual questions based on interview_type.
    """
    try:
        if req.interview_type in ["coding-mix", "company-specific"]:
            coding_count = max(
                1,
                int(
                    req.count
                    * (0.3 if req.interview_type == "company-specific" else 0.2)
                ),
            )
            instruction = (
                f"Generate exactly {coding_count} coding questions requiring the user to write code, "
                f"and {req.count - coding_count} conceptual/system-design questions. "
            )
            if req.level.lower() in ["senior", "architect"]:
                instruction += (
                    "Since this is a senior role, you MUST include at least one high-level system design/architecture question. "
                    "Ensure that you explicitly set `question_type` to 'coding' for coding questions, 'system-design' for system design questions, and 'oral' for general conceptual questions."
                )
            else:
                instruction += "Ensure that you explicitly set the `question_type` to 'coding' for coding questions, and 'oral' for conceptual questions."
        else:
            instruction = "All questions should be conceptual questions. No runnable coding questions. Set `question_type` to 'oral' for all of them."

        user_prompt = get_generation_user_prompt(
            req.count,
            req.role,
            req.level,
            instruction,
            req.company,
            req.company_track,
            req.resume_text,
        )

        # Variety: pick a random lens + nonce each call so the same role/level does
        # not keep producing the same questions. This only changes the prompt input;
        # the response shape and everything downstream is untouched.
        variety_angles = [
            "Favor practical, real-world scenarios the candidate would face on the job.",
            "Lean into debugging and troubleshooting situations.",
            "Emphasize design trade-offs and decision-making.",
            "Probe fundamentals and how things work under the hood.",
            "Cover modern tools, best practices, and code quality.",
            "Include a scenario about performance, scaling, or reliability.",
            "Mix in testing, edge cases, or handling failure.",
            "Explore collaboration, ambiguity, or past project decisions.",
        ]
        chosen = random.sample(variety_angles, k=2)
        variety_hint = (
            "\n\nVARIETY (important): Generate a FRESH, distinct set of questions — "
            "avoid the most generic/obvious ones for this role, and vary the subtopics "
            f"each time. For this session: {' '.join(chosen)} "
            f"(variation seed: {random.randint(1000, 999999)})."
        )

        text_output = call_groq(
            GENERATION_SYSTEM_PROMPT,
            user_prompt + variety_hint,
            as_json=True,
            temperature=0.9,
        )

        parsed = parse_response(text_output)
        items = parsed.get("questions", []) if isinstance(parsed, dict) else parsed

        final_questions = []
        for item in items:
            if isinstance(item, dict):
                q = item.get("question") or item.get("text") or ""
                ans = item.get("ideal_answer") or item.get("answer") or ""
                q_type = item.get("question_type") or "oral"
                if q and ans:
                    final_questions.append(
                        QuestionItem(
                            question=str(q),
                            ideal_answer=str(ans),
                            question_type=str(q_type),
                        )
                    )
            if len(final_questions) >= req.count:
                break

        if not final_questions:
            raise ValueError("No questions found in AI response")

        return QuestionResponse(
            questions=final_questions,
            model_used=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-followup", response_model=FollowUpResponse)
def generate_followup(req: FollowUpRequest):
    """
    Generate ONE probing follow-up question after a weak answer —
    the AI interviewer cross-questioning the candidate like a real interview.
    """
    try:
        user_prompt = get_followup_user_prompt(
            req.question,
            req.user_answer or "No answer provided.",
            req.ai_feedback or "The answer was incomplete.",
            req.role,
            req.level,
        )
        text_output = call_groq(FOLLOWUP_SYSTEM_PROMPT, user_prompt, as_json=True)
        parsed = parse_response(text_output)

        if not isinstance(parsed, dict) or not parsed.get("question"):
            raise ValueError("No follow-up question found in AI response")

        return FollowUpResponse(
            question=str(parsed.get("question")),
            ideal_answer=str(parsed.get("ideal_answer") or "A focused, specific answer addressing the gap."),
            question_type="oral",
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/transcribe")
def transcribe_audio(file: UploadFile = File(...)):
    """Convert an uploaded audio (webm) file to text transcription using Groq Whisper."""
    text = whisper_service.transcribe(file)
    return {"transcription": text}


@router.post("/evaluate", response_model=EvaluationResponse)
def evaluate_answer(req: EvaluationRequest):
    """
    Evaluate a user's answer (text or code) for technical accuracy and confidence.
    Uses separate system prompts for coding and conceptual evaluation.
    """
    image_base64 = None
    if req.question_type == "coding":
        if not req.user_code or not req.user_code.strip():
            raise HTTPException(
                status_code=422, detail="user_code is required for coding questions."
            )
        system_prompt = EVALUATION_SYSTEM_PROMPT_CODING
        user_prompt = get_evaluation_user_prompt_coding(
            req.question, req.user_code, req.selected_language or "unknown"
        )
    elif req.question_type == "system-design":
        system_prompt = EVALUATION_SYSTEM_PROMPT_SYSTEM_DESIGN
        if req.diagram_payload and req.diagram_payload.startswith("http"):
            import requests
            import base64

            try:
                img_resp = requests.get(req.diagram_payload, timeout=10)
                img_resp.raise_for_status()
                image_base64 = base64.b64encode(img_resp.content).decode("utf-8")
            except Exception as e:
                print(f"Error fetching diagram: {e}")

        user_prompt = get_evaluation_user_prompt_system_design(
            req.question,
            req.user_answer or "No text answer provided.",
            "Diagram attached inline." if image_base64 else req.diagram_payload,
        )
    else:
        if not req.user_answer or not req.user_answer.strip():
            return EvaluationResponse(
                technical_score=0.0,
                confidence_score=0.0,
                ai_feedback="No response was detected. Please ensure your microphone is working and that you provide a clear answer.",
                ideal_answer="A complete and relevant answer to the question.",
            )
            
        system_prompt = EVALUATION_SYSTEM_PROMPT_CONCEPTUAL
        user_prompt = get_evaluation_user_prompt_conceptual(
            req.question, req.user_answer
        )

    try:
        text_output = call_groq(
            system_prompt, user_prompt, as_json=True, image_base64=image_base64
        )
        parsed = parse_response(text_output)

        if not isinstance(parsed, dict):
            parsed = {}

        return EvaluationResponse(
            technical_score=to_float(parsed.get("technical_score")),
            confidence_score=to_float(parsed.get("confidence_score")),
            ai_feedback=parsed.get("ai_feedback", "Missing feedback. Format error."),
            ideal_answer=parsed.get(
                "ideal_answer", "Missing ideal answer. Format error."
            ),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
