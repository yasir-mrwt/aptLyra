from app.services.groq_service import call_groq_with_fallback as call_groq, stream_groq
import json


class ResumeGenerationService:
    @staticmethod
    def rewrite_bullet(bullet: str, resume_context: str) -> dict:
        system_prompt = """
        You are an expert Resume Writer and Career Coach.
        Your job is to take a weak or average resume bullet point and rewrite it into 3 strong, distinct variations using the STAR (Situation, Task, Action, Result) method.
        
        Focus on:
        - Strong action verbs
        - Quantifiable metrics (even if you have to suggest placeholder metrics like [X]%)
        - Highlighting impact and results
        
        Return exactly 3 variations in a JSON format:
        {
            "variations": [
                "Rewritten bullet 1...",
                "Rewritten bullet 2...",
                "Rewritten bullet 3..."
            ]
        }
        Do not return markdown, only the raw JSON string.
        """

        user_prompt = f"""
        Original Bullet Point:
        {bullet}
        
        Resume Context (for understanding the role/industry):
        {resume_context}
        """

        try:
            response_text = call_groq(system_prompt, user_prompt, as_json=True)
            # Try to strip markdown if Gemini accidentally included it
            if response_text.startswith("```json"):
                response_text = response_text[7:-3]
            elif response_text.startswith("```"):
                response_text = response_text[3:-3]

            data = json.loads(response_text)
            return {"success": True, "variations": data.get("variations", [])}
        except Exception as e:
            return {"success": False, "error": str(e)}

    @staticmethod
    def stream_bullet_rewrite(bullet: str, resume_context: str):
        system_prompt = """
        You are an expert Resume Writer and Career Coach.
        Your job is to take a weak or average resume bullet point and rewrite it into 3 strong, distinct variations using the STAR (Situation, Task, Action, Result) method.
        
        Focus on:
        - Strong action verbs
        - Quantifiable metrics (even if you have to suggest placeholder metrics like [X]%)
        - Highlighting impact and results
        
        Format the output clearly, returning only the text variations, separated by a blank line. Do not return JSON.
        """

        user_prompt = f"""
        Original Bullet Point:
        {bullet}
        
        Resume Context (for understanding the role/industry):
        {resume_context}
        """

        for chunk in stream_groq(system_prompt, user_prompt):
            yield chunk

    @staticmethod
    def generate_cover_letter(resume_text: str, jd_text: str) -> dict:
        system_prompt = """
        You are an elite Career Coach and Executive Writer.
        Your task is to write a highly tailored, professional, and compelling cover letter for a candidate applying to a specific job.
        
        Guidelines:
        1. Keep it concise (3-4 paragraphs maximum).
        2. Do not hallucinate experiences that are not in the resume.
        3. Highlight the EXACT overlapping skills between the candidate's resume and the job description.
        4. Use a confident, engaging tone.
        5. Format it clearly. Use placeholders like [Hiring Manager Name] or [Company Name] if they are not discernible from the JD.
        
        Return a JSON object containing the cover letter text:
        {
            "cover_letter": "Dear Hiring Manager,\\n\\nI am writing to express..."
        }
        Do not return markdown, only the raw JSON string.
        """

        user_prompt = f"""
        Job Description:
        {jd_text}
        
        Candidate's Resume Text:
        {resume_text}
        """

        try:
            response_text = call_groq(system_prompt, user_prompt, as_json=True)
            # Try to strip markdown if Gemini accidentally included it
            if response_text.startswith("```json"):
                response_text = response_text[7:-3]
            elif response_text.startswith("```"):
                response_text = response_text[3:-3]

            data = json.loads(response_text)
            return {"success": True, "cover_letter": data.get("cover_letter", "")}
        except Exception as e:
            return {"success": False, "error": str(e)}

    @staticmethod
    def stream_cover_letter(resume_text: str, jd_text: str):
        system_prompt = """
        You are an elite Career Coach and Executive Writer.
        Your task is to write a highly tailored, professional, and compelling cover letter for a candidate applying to a specific job.
        
        Guidelines:
        1. Keep it concise (3-4 paragraphs maximum).
        2. Do not hallucinate experiences that are not in the resume.
        3. Highlight the EXACT overlapping skills between the candidate's resume and the job description.
        4. Use a confident, engaging tone.
        5. Format it clearly. Use placeholders like [Hiring Manager Name] or [Company Name] if they are not discernible from the JD.
        
        Return the cover letter as plain text (with markdown formatting for paragraphs). Do not return JSON.
        """

        user_prompt = f"""
        Job Description:
        {jd_text}
        
        Candidate's Resume Text:
        {resume_text}
        """

        for chunk in stream_groq(system_prompt, user_prompt):
            yield chunk
