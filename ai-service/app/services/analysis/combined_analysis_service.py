"""
Combined Skills Extraction + Resume Audit Service

Merges two separate Gemini calls (skills extraction + resume analysis) into
a single call to reduce API usage and avoid free-tier rate limits.
"""

from app.services.groq_service import call_groq_with_fallback as call_groq, parse_response
import logging

logger = logging.getLogger("CombinedAnalysisService")

COMBINED_ANALYSIS_SYSTEM_PROMPT = """
You are a senior Talent Acquisition specialist AND professional Resume Auditor.
Your task has TWO parts — extract skills AND audit the resume. Perform both in one pass.

You MUST output a valid JSON object matching this EXACT structure:
{
  "skills": {
    "technical": ["string (hard tech skills, tools, frameworks, databases, languages)"],
    "soft": ["string (soft skills, communications, leadership, problem solving)"]
  },
  "analysis": {
    "ats_formatting_issues": ["string (e.g., multi-column warning, generic tables issue)"],
    "readability_score": number (0-100),
    "tone_assessment": "string (e.g., Professional, Academic, Passive)",
    "strengths": ["string (key career accomplishments, strong verbs, clear impacts)"],
    "weaknesses": ["string (lack of quantitative results, weak verbs, passive bullets)"]
  }
}

### Guidelines:
- For skills: compile comprehensive, cleaned, and standardized lists. No duplicates.
- For analysis: be critical, realistic, and highly professional.
"""


class CombinedAnalysisService:
    @staticmethod
    def analyze_and_extract(raw_text: str) -> dict:
        """
        Performs skills extraction AND resume audit in a single Gemini call.
        Returns: { "skills": {...}, "analysis": {...} }
        """
        logger.info("Executing combined skills extraction + resume audit (single Gemini call)")
        from datetime import datetime
        current_year = datetime.now().year
        
        dynamic_prompt = COMBINED_ANALYSIS_SYSTEM_PROMPT + f"\n\n### CRITICAL CONTEXT:\n- The current year is {current_year}. Do NOT flag experience dates up to {current_year} as 'future dates' or 'typos'.\n"
        
        user_prompt = f"Extract all skills AND perform a full resume audit on the following resume text:\n\n{raw_text}"
        try:
            response_text = call_groq(
                system_prompt=dynamic_prompt,
                user_prompt=user_prompt,
                as_json=True
            )
            result = parse_response(response_text)
            
            skills = result.get("skills", {"technical": [], "soft": []})
            analysis = result.get("analysis", {})
            
            logger.info(
                f"Combined analysis completed: {len(skills.get('technical', []))} tech skills, "
                f"{len(skills.get('soft', []))} soft skills, "
                f"readability={analysis.get('readability_score', 'N/A')}"
            )
            return result
        except Exception as e:
            logger.error(f"Combined analysis failed: {str(e)}")
            raise e
