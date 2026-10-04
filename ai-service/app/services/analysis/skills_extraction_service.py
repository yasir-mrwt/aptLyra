from app.services.groq_service import call_groq_with_fallback as call_groq, parse_response
import logging

logger = logging.getLogger("SkillsExtractionService")

SKILLS_SYSTEM_PROMPT = """
You are an expert Talent Acquisition specialist. Your goal is to extract and standardize skills from raw resume text.
You MUST output a valid JSON object matching the exact structure below:
{
  "technical": ["string (hard tech skills, tools, frameworks, databases, languages)"],
  "soft": ["string (soft skills, communications, leadership, problem solving)"]
}
Compile comprehensive, cleaned, and standardized lists. Do not include duplicates.
"""

class SkillsExtractionService:
    @staticmethod
    def extract_skills(raw_text: str) -> dict:
        logger.info("Executing skills extraction pipeline")
        user_prompt = f"Extract all technical and soft skills from the following resume text:\n\n{raw_text}"
        try:
            response_text = call_groq(
                system_prompt=SKILLS_SYSTEM_PROMPT,
                user_prompt=user_prompt,
                as_json=True
            )
            skills = parse_response(response_text)
            logger.info(f"Skills extracted successfully: {len(skills.get('technical', []))} tech, {len(skills.get('soft', []))} soft skills.")
            return skills
        except Exception as e:
            logger.error(f"Skills extraction failed: {str(e)}")
            raise e
