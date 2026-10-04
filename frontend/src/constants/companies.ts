export interface CompanyTrack {
  id: string;
  name: string;
  description: string;
  levels: string[];
}

export interface CompanyProfile {
  id: string;
  name: string;
  tracks: CompanyTrack[];
}

export const COMPANIES: Record<string, CompanyProfile> = {
  general: {
    id: "general",
    name: "General (No specific company)",
    tracks: [
      { id: "general", name: "General", description: "Standard interview", levels: [] }
    ]
  },
  google: {
    id: "google",
    name: "Google",
    tracks: [
      { id: "swe-general", name: "SWE General", description: "General Software Engineering", levels: ["L3", "L4", "L5", "L6"] },
      { id: "frontend", name: "Frontend Engineer", description: "Frontend focused SWE", levels: ["L3", "L4", "L5"] },
      { id: "backend", name: "Backend Engineer", description: "Backend & Systems", levels: ["L3", "L4", "L5", "L6"] },
      { id: "ml-engineer", name: "ML Engineer", description: "Machine Learning & AI", levels: ["L3", "L4", "L5"] },
    ],
  },
  amazon: {
    id: "amazon",
    name: "Amazon",
    tracks: [
      { id: "sde-1", name: "SDE I", description: "Entry-level SWE", levels: ["SDE I"] },
      { id: "sde-2", name: "SDE II", description: "Mid-level SWE", levels: ["SDE II"] },
      { id: "sde-3", name: "SDE III", description: "Senior SWE", levels: ["SDE III"] },
      { id: "frontend", name: "Frontend Engineer", description: "Web UI/UX", levels: ["FEE I", "FEE II", "FEE III"] },
    ],
  },
  meta: {
    id: "meta",
    name: "Meta",
    tracks: [
      { id: "swe", name: "Software Engineer", description: "General SWE", levels: ["E3", "E4", "E5", "E6"] },
      { id: "frontend", name: "Frontend Engineer", description: "React/Web", levels: ["E3", "E4", "E5"] },
      { id: "infrastructure", name: "Production Engineer", description: "Systems/Infra", levels: ["E3", "E4", "E5"] }
    ],
  },
  microsoft: {
    id: "microsoft",
    name: "Microsoft",
    tracks: [
      { id: "swe", name: "Software Engineer", description: "General SWE", levels: ["59", "60", "61", "62", "63"] }
    ],
  }
};
