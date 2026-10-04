from app.services.groq_service import call_groq_with_fallback as call_groq, parse_response
import logging

logger = logging.getLogger("RecommendationService")

RECOMMENDATIONS_SYSTEM_PROMPT = """
You are a senior Executive Career Coach and Resume Optimizer.
Based on the resume audit results and extracted skills, formulate highly customized, tactical, and actionable career and resume improvement recommendations.
You MUST output a valid JSON object matching the exact structure below:
{
  "formatting_improvements": ["string (e.g., convert columns to single-column page format)"],
  "content_optimizations": ["string (e.g., add quantitative metrics to role descriptions)"],
  "upskilling_path": ["string (specific certifications, target frameworks, or domain methodologies to learn to close gaps)"]
}
Avoid generic advice; make each recommendation concrete, realistic, and highly professional.
"""

class RecommendationService:
    @staticmethod
    def generate_recommendations(analysis_data: dict, skills_data: dict, jd_match_report: dict = None) -> dict:
        logger.info("Generating carrier and optimization recommendations")
        
        user_prompt = f"### Resume Audit Details:\n{analysis_data}\n\n### Extracted Skills:\n{skills_data}"
        if jd_match_report:
            user_prompt += f"\n\n### Job Description Match Gaps:\n{jd_match_report}"
            
        try:
            response_text = call_groq(
                system_prompt=RECOMMENDATIONS_SYSTEM_PROMPT,
                user_prompt=user_prompt,
                as_json=True
            )
            recommendations = parse_response(response_text)
            logger.info("Recommendations compiled successfully")
            return recommendations
        except Exception as e:
            logger.error(f"Failed to compile recommendations: {str(e)}")
            raise e
