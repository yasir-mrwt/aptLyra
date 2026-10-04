"""
Feedback Stream Service

Generates a real-time, streaming markdown feedback report (Issues & Strengths)
using Gemini's SSE streaming capability.
"""

from app.services.groq_service import stream_groq
import logging

logger = logging.getLogger("FeedbackStreamService")

FEEDBACK_STREAM_SYSTEM_PROMPT = """
You are a senior Talent Acquisition specialist AND professional Resume Auditor.
Your task is to provide a comprehensive, real-time feedback report on a candidate's resume.

Please structure your response in Markdown with TWO clear sections:
## Issues Found
- Bullet point the critical ATS formatting issues, missing links, weak verbs, etc.

## Strengths
- Bullet point the strong verbs, good formatting, active voice, etc.

Format the text beautifully in Markdown. Be critical, realistic, and highly professional.
Do NOT use JSON. Do NOT wrap your response in JSON codeblocks. Output plain Markdown only.
"""

class FeedbackStreamService:
    @staticmethod
    def stream_feedback(raw_text: str):
        """
        Calls the Gemini streaming API and yields markdown chunks.
        """
        logger.info("Executing feedback stream generation")
        from datetime import datetime
        current_year = datetime.now().year
        
        dynamic_prompt = FEEDBACK_STREAM_SYSTEM_PROMPT + f"\n\n### CRITICAL CONTEXT:\n- The current year is {current_year}. Do NOT flag experience dates up to {current_year} as 'future dates'.\n"
        
        user_prompt = f"Please provide your markdown feedback report on this resume text:\n\n{raw_text}"
        
        try:
            for chunk in stream_groq(
                system_prompt=dynamic_prompt,
                user_prompt=user_prompt
            ):
                yield chunk
        except Exception as e:
            logger.error(f"Feedback stream failed: {str(e)}")
            yield f"\n\n**Error:** {str(e)}"
