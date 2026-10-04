from app.services.groq_service import call_groq_with_fallback as call_groq, parse_response
import logging

logger = logging.getLogger("ResumeParsingService")

PARSING_SYSTEM_PROMPT = """
You are an expert ATS parser. Your goal is to convert raw unstructured resume text into a highly structured JSON profile.

CRITICAL INSTRUCTION: First, strictly evaluate if the provided text is actually a resume, CV, or professional profile. If the text is a generic document, an article, a code snippet, or any non-resume text, you MUST set "is_resume" to false and leave all other fields empty. Do not try to force non-resume text into a resume structure.

You MUST output a valid JSON object matching the exact structure below:
{
  "is_resume": true, // boolean (set to true if the text is a resume/CV, false otherwise)
  "personal_info": {
    "name": "string",
    "email": "string",
    "phone": "string",
    "location": "string",
    "links": ["string"]
  },
  "summary": "string (concise profile summary)",
  "experience": [
    {
      "company": "string",
      "role": "string",
      "duration": "string",
      "description": "string"
    }
  ],
  "projects": [
    {
      "title": "string",
      "duration": "string",
      "link": "string",
      "description": "string"
    }
  ],
  "education": [
    {
      "institution": "string",
      "degree": "string",
      "year": "string"
    }
  ]
}
Be precise. If some sections are missing, leave them empty or as empty arrays. Do not invent any facts.
CRITICAL: If the candidate lists academic or personal projects but has no formal work experience, put those projects ONLY in the `projects` array and leave the `experience` array empty. Do not mistake projects for work experience.
"""


class ResumeParsingService:
    @staticmethod
    def parse(raw_text: str) -> dict:
        logger.info("Executing LLM resume parsing pipeline")
        user_prompt = f"Extract structured profile data from the following resume text:\n\n{raw_text}"
        try:
            response_text = call_groq(
                system_prompt=PARSING_SYSTEM_PROMPT,
                user_prompt=user_prompt,
                as_json=True,
            )
            parsed_data = parse_response(response_text)

            # Ensure is_resume is interpreted as a boolean
            is_resume_flag = parsed_data.get("is_resume", True)
            if isinstance(is_resume_flag, str):
                is_resume_flag = str(is_resume_flag).lower() == "true"
            parsed_data["is_resume"] = is_resume_flag

            if not is_resume_flag:
                logger.warning("Uploaded document is not a valid resume/CV")
                # Do not raise an exception, return gracefully so the pipeline can halt cleanly
                return parsed_data

            logger.info("Resume parsed successfully")
            return parsed_data
        except Exception as e:
            logger.error(f"Resume parsing failed: {str(e)}")
            raise e
