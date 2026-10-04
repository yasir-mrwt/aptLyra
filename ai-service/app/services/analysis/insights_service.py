"""
Deep Insights Service
=====================
Recruiter-grade resume intelligence in a single Groq call:

  - executive_summary      — 3-4 sentence recruiter briefing
  - role_alignment         — per-area fit scores (JD-aware when a JD is given)
  - skill_depth            — per-skill level (beginner/moderate/strong/advanced) + score
  - top_signals            — standout, hard-to-fake resume points
  - weak_areas             — claims with no implementation evidence
  - inferred_competencies  — competencies deduced from project evidence
  - credibility_risks      — claims an interviewer WILL probe, with the probe question
  - interview_prep         — readiness note, priority areas, strategy tips

When `jd_text` is provided, alignment/prep are computed against THAT job
description; otherwise against the role the resume itself targets.
"""

from app.services.groq_service import call_groq_with_fallback as call_groq, parse_response
from app.prompts import BASE_SYSTEM_INSTRUCTION, sanitize_input

INSIGHTS_SYSTEM_PROMPT = (
    f"{BASE_SYSTEM_INSTRUCTION}"
    "You are a brutally honest senior technical recruiter and interview coach. "
    "You analyze resumes the way a skeptical interviewer does: every claim needs evidence, "
    "every buzzword gets probed, every gap gets flagged. Be specific — quote or reference the "
    "actual claims from the resume, never generic advice. "
    "Output ONLY a valid JSON object with EXACTLY this shape:\n"
    "{"
    '"executive_summary": "<3-4 sentence recruiter briefing: who this candidate is, their strongest evidence, and the core open question>", '
    '"role_alignment": [{"area": "<competency area>", "score": <0-100>}] (6-10 areas), '
    '"skill_depth": [{"skill": "<skill cluster with technologies>", "level": "beginner|moderate|strong|advanced", "score": <0-100>}] (5-8 skills), '
    '"top_signals": [{"title": "<the specific impressive claim>", "reason": "<why this is a strong, hard-to-fake signal>"}] (3-5), '
    '"weak_areas": [{"title": "<the gap>", "detail": "<what is claimed vs what evidence is missing>"}] (2-5), '
    '"inferred_competencies": [{"title": "<competency>", "evidence": "<the resume evidence supporting it>", "confidence": "high|medium"}] (3-6), '
    '"credibility_risks": [{"claim": "<the exact resume claim>", "risk": "<why an interviewer will doubt or probe this>", "severity": "high|medium|low", "probe": "<the exact probing question they will ask>"}] (2-5), '
    '"interview_prep": {'
    '"readiness_note": "<one paragraph: where to focus prep, what to avoid, what their edge is>", '
    '"priority_areas": [{"topic": "<area to prepare>", "why": "<why interviewers will target this>", "focus_points": ["<specific sub-topic>"] (3-4), "severity": "high|medium"}] (2-4), '
    '"strategy_tips": ["<tactical interview tip specific to THIS resume>"] (3-5)'
    "}}"
)


class InsightsService:
    @staticmethod
    def generate(raw_text: str, parsed_profile: dict = None, jd_text: str = None) -> dict:
        """Run the deep-insight analysis. Returns {} on failure (non-fatal step)."""
        s_resume = sanitize_input(raw_text, 20000)

        prompt = f"RESUME:\n{s_resume}\n\n"

        if jd_text:
            s_jd = sanitize_input(jd_text, 8000)
            prompt += (
                f"TARGET JOB DESCRIPTION:\n{s_jd}\n\n"
                "Compute role_alignment, credibility_risks and interview_prep AGAINST THIS SPECIFIC JD — "
                "alignment areas must be the competencies this JD actually demands, and prep advice must "
                "target the gaps between this resume and this JD.\n\n"
            )
        else:
            prompt += (
                "No job description was provided. Infer the role this resume targets and compute "
                "role_alignment against the standard expectations for that role and seniority.\n\n"
            )

        role_hint = (parsed_profile or {}).get("target_role") or (parsed_profile or {}).get("title")
        if role_hint:
            prompt += f"Candidate's stated target role: {sanitize_input(str(role_hint), 100)}\n\n"

        prompt += "Analyze thoroughly and return ONLY the raw JSON object."

        try:
            text_output = call_groq(INSIGHTS_SYSTEM_PROMPT, prompt, as_json=True)
            parsed = parse_response(text_output)
            return parsed if isinstance(parsed, dict) else {}
        except Exception as e:
            print(f"[Insights] Generation failed (non-fatal): {e}")
            return {}
