from app.services.groq_service import call_groq_with_fallback as call_groq, parse_response
import logging

logger = logging.getLogger("AIResumeAnalysisService")

ANALYSIS_SYSTEM_PROMPT = """
You are a senior professional Resume Auditor. Your task is to perform a style, tone, formatting, and content audit on the provided resume text.
You MUST output a valid JSON object matching the exact structure below:
{
  "ats_formatting_issues": ["string (e.g., multi-column warning, generic tables issue)"],
  "readability_score": number (0-100),
  "tone_assessment": "string (e.g., Professional, Academic, Passive)",
  "strengths": ["string (key career accomplishments, strong verbs, clear impacts)"],
  "weaknesses": ["string (lack of quantitative results, weak verbs, passive bullets)"]
}
Be critical, realistic, and highly professional.
"""

class AIResumeAnalysisService:
    @staticmethod
    def analyze(raw_text: str) -> dict:
        logger.info("Executing resume audit/analysis pipeline")
        user_prompt = f"Audit the following resume text:\n\n{raw_text}"
        try:
            response_text = call_groq(
                system_prompt=ANALYSIS_SYSTEM_PROMPT,
                user_prompt=user_prompt,
                as_json=True
            )
            analysis_results = parse_response(response_text)
            logger.info("Resume audit completed successfully")
            return analysis_results
        except Exception as e:
            logger.error(f"Resume audit failed: {str(e)}")
            raise e
