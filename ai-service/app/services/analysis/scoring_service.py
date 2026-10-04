import logging

logger = logging.getLogger("CandidateScoringService")

class CandidateScoringService:
    @staticmethod
    def calculate_scores(analysis_data: dict, skills_data: dict, jd_match_report: dict = None) -> dict:
        """
        Aggregates individual service data and computes normalized scoring indices:
        1. ats_score: formatting penalties and skills count heuristic.
        2. overall_quality: tone, readability, and content strengths weightings.
        3. jd_match_score: semantic similarity and experience fit from JD matching service.
        """
        logger.info("Computing normalized candidate scoring metrics")
        
        # 1. ATS Score Heuristic: start at 90, deduct for formatting issues, add for skills density
        ats_score = 90
        formatting_issues = len(analysis_data.get("ats_formatting_issues", []))
        ats_score -= formatting_issues * 10
        
        skills_count = len(skills_data.get("technical", []))
        if skills_count > 15:
            ats_score += 10
        elif skills_count > 5:
            ats_score += 5
        else:
            ats_score -= 10
            
        ats_score = max(30, min(100, ats_score))
        
        # 2. Overall Quality Score Heuristic: weighted readability and balance of strengths/weaknesses
        readability = analysis_data.get("readability_score", 70)
        strengths_count = len(analysis_data.get("strengths", []))
        weaknesses_count = len(analysis_data.get("weaknesses", []))
        
        content_mod = (strengths_count - weaknesses_count) * 4
        overall_quality = int(readability * 0.6 + 30 + content_mod)
        overall_quality = max(40, min(100, overall_quality))
        
        # 3. JD Match Score: mapping from JD matching results if provided
        jd_match = 0
        if jd_match_report:
            jd_match = jd_match_report.get("match_score", 0)
            
        logger.info(f"Scores aggregated: ATS={ats_score}, Quality={overall_quality}, JD Match={jd_match}")
        return {
            "ats_score": ats_score,
            "overall_quality": overall_quality,
            "jd_match": jd_match
        }
