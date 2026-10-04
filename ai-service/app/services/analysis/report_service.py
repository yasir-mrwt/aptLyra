from app.services.groq_service import call_groq_with_fallback as call_groq, parse_response
import logging

logger = logging.getLogger("ReportGenerationService")

REPORT_SYSTEM_PROMPT = """
You are a Lead Tech Recruiter. Based on candidate profile data and audit evaluations, compile a concise, highly insightful, recruiter-style summary.
You MUST output a valid JSON object matching the exact structure below:
{
  "recruiter_summary": "string (1-2 paragraph executive summary explaining who they are, domain highlights, and readiness level)",
  "swot_analysis": {
    "strengths": ["string"],
    "weaknesses": ["string"],
    "opportunities": ["string (e.g., target senior roles, specialize in Cloud)"],
    "threats": ["string (e.g., skill stagnation, formatting issues blocking ATS)"]
  }
}
Keep it sharp, business-oriented, and objective.
"""

class ReportGenerationService:
    @staticmethod
    def compile_report(parsed_profile: dict, analysis_data: dict, skills_data: dict, recommendations: dict) -> dict:
        logger.info("Compiling final recruiter analysis and SWOT report")
        
        user_prompt = f"### Profile:\n{parsed_profile}\n\n### Audit:\n{analysis_data}\n\n### Skills:\n{skills_data}\n\n### Recommendations:\n{recommendations}"
        try:
            response_text = call_groq(
                system_prompt=REPORT_SYSTEM_PROMPT,
                user_prompt=user_prompt,
                as_json=True
            )
            report = parse_response(response_text)
            logger.info("Report compiled successfully")
            return report
        except Exception as e:
            logger.error(f"Failed to compile final report: {str(e)}")
            raise e
