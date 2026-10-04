from app.services.groq_service import call_groq_with_fallback as call_groq, parse_response
import logging

logger = logging.getLogger("JDAnalysisService")

JD_ANALYSIS_SYSTEM_PROMPT = """
You are an expert recruitment and Talent Acquisition specialist. Your task is to analyze the provided Job Description (JD) text and extract structured candidate profiles, skill requirements, and metadata targets.
You MUST output a valid JSON object matching the exact structure below:
{
  "title": "string (e.g. Senior Software Engineer)",
  "required_skills": ["string (essential skills, languages, tools, frameworks or databases required)"],
  "preferred_skills": ["string (nice-to-have skills, preferred credentials, or secondary tools)"],
  "seniority_level": "string (Entry / Mid / Senior / Lead / Executive)",
  "min_years_experience": number (the minimum years of experience required, default to 0 if not explicitly mentioned),
  "responsibilities": ["string (key functional responsibilities and role duties)"]
}
Be precise. Do not invent any requirements not mentioned in the text. Keep extracted values standardized and concise.
"""

class JDAnalysisService:
    @staticmethod
    def analyze_jd(jd_text: str) -> dict:
        """
        Extracts structured criteria and requirements from a raw job description text via Gemini.
        """
        logger.info("Executing LLM Job Description requirements analysis pipeline")
        user_prompt = f"Analyze the following Job Description text:\n\n{jd_text}"
        try:
            response_text = call_groq(
                system_prompt=JD_ANALYSIS_SYSTEM_PROMPT,
                user_prompt=user_prompt,
                as_json=True
            )
            parsed_data = parse_response(response_text)
            logger.info("Job Description analyzed successfully")
            return parsed_data
        except Exception as e:
            logger.error(f"Job Description requirements analysis failed: {str(e)}")
            raise e
