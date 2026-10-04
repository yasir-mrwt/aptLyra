from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from typing import Optional
import tempfile
import os
from app.services.speech_analysis_service import SpeechAnalysisService
from app.services.whisper_service import WhisperService, MAX_AUDIO_BYTES
from app.services.groq_service import call_groq_tts

router = APIRouter()


class TTSRequest(BaseModel):
    text: str = Field(..., max_length=2000)
    voice: Optional[str] = Field(default=None, max_length=50)


@router.post("/tts")
def synthesize_speech(req: TTSRequest):
    """
    Synthesize the AI interviewer's voice (Groq PlayAI TTS, female voice by default).
    Returns WAV audio. Clients fall back to browser speechSynthesis on failure.
    """
    audio_bytes = call_groq_tts(req.text, voice=req.voice)
    return Response(
        content=audio_bytes,
        media_type="audio/wav",
        headers={"Cache-Control": "no-store"},
    )

@router.post("/analyze")
def analyze_speech(
    audio: UploadFile = File(...),
    transcript: str = Form(None)
):
    """
    Analyzes uploaded audio to calculate speech metrics like pace, pauses, and filler words.
    If transcript is not provided, it generates one using Whisper.
    """
    temp_file_path = None
    try:
        # Save uploaded file temporarily
        suffix = os.path.splitext(audio.filename)[1] if audio.filename else ".webm"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            content = audio.file.read(MAX_AUDIO_BYTES + 1)
            if not content:
                raise HTTPException(422, "Audio is empty. Please record again.")
            if len(content) > MAX_AUDIO_BYTES:
                raise HTTPException(413, "Audio exceeds the 10 MiB limit.")
            temp_file.write(content)
            temp_file_path = temp_file.name

        # Generate transcript if not provided
        actual_transcript = transcript
        if not actual_transcript:
            transcription_result = WhisperService.transcribe_audio(temp_file_path)
            actual_transcript = transcription_result.get("text", "")

        if not isinstance(actual_transcript, str) or not actual_transcript.strip():
            raise HTTPException(422, "No speech detected. Please record again.")

        # Analyze speech patterns
        metrics = SpeechAnalysisService.analyze_audio(temp_file_path, actual_transcript)
        
        if metrics and "error" in metrics:
            raise HTTPException(status_code=500, detail=metrics["error"])
            
        return {
            "metrics": metrics,
            "transcript": actual_transcript.strip(),
            "metrics_status": "available" if metrics else "unavailable"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Speech processing failed. Please retry.")
    finally:
        # Clean up temporary file
        if temp_file_path and os.path.exists(temp_file_path):
            os.remove(temp_file_path)
