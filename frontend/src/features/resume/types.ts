
// ── Deep Insights (recruiter-grade analysis, JD-aware) ──
export interface DeepInsights {
  executive_summary?: string;
  role_alignment?: { area: string; score: number }[];
  skill_depth?: { skill: string; level: "beginner" | "moderate" | "strong" | "advanced"; score: number }[];
  top_signals?: { title: string; reason: string }[];
  weak_areas?: { title: string; detail: string }[];
  inferred_competencies?: { title: string; evidence: string; confidence: "high" | "medium" }[];
  credibility_risks?: { claim: string; risk: string; severity: "high" | "medium" | "low"; probe: string }[];
  interview_prep?: {
    readiness_note?: string;
    priority_areas?: { topic: string; why: string; focus_points?: string[]; severity: "high" | "medium" }[];
    strategy_tips?: string[];
  };
}

export interface ParsedProfile {
  personal_info?: {
    name?: string;
    email?: string;
    phone?: string;
    location?: string;
    links?: string[];
  };
  summary?: string;
  experience?: Array<{
    company?: string;
    role?: string;
    title?: string;
    duration?: string;
    location?: string;
    description?: string;
  }>;
  education?: Array<{
    institution?: string;
    school?: string;
    degree?: string;
    field?: string;
    year?: string;
  }>;
  projects?: Array<{
    title?: string;
    duration?: string;
    link?: string;
    description?: string;
  }>;
}

export interface AIAnalysisReport {
  extracted_data?: {
    personal_info?: ParsedProfile["personal_info"];
    summary?: string;
    skills?: {
      technical?: string[];
      soft?: string[];
    };
    experience?: ParsedProfile["experience"];
    education?: ParsedProfile["education"];
  };
  evaluation?: {
    ats_score?: number;
    overall_quality?: number;
    strengths?: string[];
    weaknesses?: string[];
    improvement_suggestions?: string[];
    candidate_summary?: string;
  };
  _v2?: {
    insights?: DeepInsights;
    skills?: { technical?: string[]; soft?: string[] };
    analysis?: {
      ats_formatting_issues?: string[];
      readability_score?: number;
      tone_assessment?: string;
      strengths?: string[];
      weaknesses?: string[];
    };
    scores?: { ats_score?: number; overall_quality?: number };
    recommendations?: {
      formatting_improvements?: string[];
      content_optimizations?: string[];
      upskilling_path?: string[];
    };
    report?: {
      recruiter_summary?: string;
      swot_analysis?: {
        strengths?: string[];
        weaknesses?: string[];
        opportunities?: string[];
        threats?: string[];
      };
    };
  };
}

export interface JDMatchReport {
  match_score?: number;
  explanation?: string;
  missing_skills?: string[];
  matched_skills?: string[];
  experience_fit?: string;
  recommendations?: string[];
}

export interface ResumeData {
  _id: string;
  originalFilename: string;
  fileType?: string;
  status: string;
  jdText?: string;
  streamingFeedbackText?: string;
  parsedData?: {
    rawText?: string;
    method?: string;
    parsedProfile?: ParsedProfile;
  };
  analysisReport?: AIAnalysisReport;
  jdMatchReport?: JDMatchReport;
  scores?: {
    ats?: number;
    overall?: number;
    jdMatch?: number;
  };
  createdAt?: string;
  updatedAt?: string;
}

export type ResultTab = "ats" | "insights" | "extraction" | "jobmatch" | "feedback";
