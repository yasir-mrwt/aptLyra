import time
from app.services.extraction.file_processing_service import FileProcessingService
from app.services.analysis.parsing_service import ResumeParsingService
from app.services.analysis.combined_analysis_service import CombinedAnalysisService
from app.services.analysis.combined_report_service import CombinedReportService
from app.services.analysis.scoring_service import CandidateScoringService
from app.services.matching.matching_service import ResumeJDMatchingService
from app.services.analysis.insights_service import InsightsService

class ResumeOrchestratorService:
    """
    ARCHITECTURE OVERVIEW:
    This class is the "Brain" of the AI pipeline. It orchestrates the flow of data through
    multiple specialized LLM steps. 
    It breaks down large complex tasks (like full resume analysis) into modular, independent
    LLM API calls (Parsing, Scoring, Report Generation) to improve accuracy and prevent hallucinations.
    """
    
    @staticmethod
    def process_resume(contents: bytes, filename: str) -> dict:
        """
        Coordinates file processing and LLM-based resume parsing.
        """
        t_start = time.time()
        
        # Step 1: File Processing + OCR fallback
        extraction_result = FileProcessingService.process_file(contents, filename)
        raw_text = extraction_result.get("raw_text", "")
        method_used = extraction_result.get("method_used", "unknown")
        file_processing_ms = int((time.time() - t_start) * 1000)

        # Step 2: LLM resume parsing
        t_parse = time.time()
        parsed_profile = ResumeParsingService.parse(raw_text)
        parsing_ms = int((time.time() - t_parse) * 1000)
        
        # Check if valid resume
        is_resume = parsed_profile.get("is_resume", True)
        if not is_resume:
            return {
                "success": False,
                "is_resume": False,
                "message": "The uploaded document does not appear to be a valid resume or CV.",
                "method_used": method_used,
                "raw_text": raw_text,
                "metrics": {
                    "file_processing_ms": file_processing_ms,
                    "parsing_ms": parsing_ms
                }
            }

        return {
            "success": True,
            "is_resume": True,
            "method_used": method_used,
            "raw_text": raw_text,
            "parsed_profile": parsed_profile,
            "metrics": {
                "file_processing_ms": file_processing_ms,
                "parsing_ms": parsing_ms
            }
        }

    @staticmethod
    def analyze_resume(raw_text: str, parsed_profile: dict, jd_text: str = None) -> dict:
        """
        Coordinates the combined extraction, candidate scoring, and report generation.
        """
        # Step 1: Combined Skills Extraction + Resume Audit (1 Gemini call)
        t_combined_analysis = time.time()
        combined_result = CombinedAnalysisService.analyze_and_extract(raw_text)
        skills_data = combined_result.get("skills", {"technical": [], "soft": []})
        analysis_data = combined_result.get("analysis", {})
        combined_analysis_ms = int((time.time() - t_combined_analysis) * 1000)

        # Step 2: Candidate Scoring (pure computation, no Gemini call)
        t_scoring = time.time()
        scores = CandidateScoringService.calculate_scores(analysis_data, skills_data)
        scoring_ms = int((time.time() - t_scoring) * 1000)

        # Step 3: Combined Recommendations + Report (1 Gemini call)
        t_combined_report = time.time()
        report_result = CombinedReportService.generate_report_and_recommendations(
            parsed_profile, analysis_data, skills_data
        )
        recommendations = report_result.get("recommendations", {})
        report = report_result.get("report", {})
        combined_report_ms = int((time.time() - t_combined_report) * 1000)

        # Step 4: Deep Insights — credibility risks, skill depth, role alignment,
        # interview prep (JD-aware when a JD was uploaded). 1 Groq call, non-fatal.
        t_insights = time.time()
        insights = InsightsService.generate(raw_text, parsed_profile, jd_text)
        insights_ms = int((time.time() - t_insights) * 1000)

        return {
            "success": True,
            "skills": skills_data,
            "analysis": analysis_data,
            "evaluation": scores,
            "recommendations": recommendations,
            "report": report,
            "insights": insights,
            "metrics": {
                "combined_analysis_ms": combined_analysis_ms,
                "scoring_ms": scoring_ms,
                "combined_report_ms": combined_report_ms,
                "insights_ms": insights_ms,
            }
        }

    @staticmethod
    def match_resume(resume_text: str, resume_skills: list, jd_text: str) -> dict:
        """
        Coordinates the JD matching via deep semantic scoring and contextual evaluation.
        """
        t_start = time.time()
        match_result = ResumeJDMatchingService.match(resume_text, resume_skills, jd_text)
        matching_ms = int((time.time() - t_start) * 1000)

        match_result["metrics"] = {
            "jd_matching_ms": matching_ms
        }

        return {
            "success": True,
            **match_result
        }
