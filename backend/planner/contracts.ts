import type { Difficulty, QuestionCategory } from "../types/knowledge.js";
import type { RetrievalHit } from "../retrieval/contracts.js";

export const PLANNER_VERSION = "deterministic-v1";
export const CONTRACT_VERSION = "planner-v1";
export const ROOTS = ["dsa","oop","dbms-sql","os","networks","backend-web","design-lite","programming"] as const;
export const ROLES = ["Software Engineer","Backend Developer","Full Stack Developer"] as const;
export interface Setup {
  role: typeof ROLES[number]; level: "junior"; taxonomyVersion: "junior-se-v1";
  competencies: string[]; difficulty: Difficulty; mode: "oral" | "coding" | "mixed";
  count: number; minutes: number; language: "en"; codeLanguage: "python" | "javascript";
  includeRecentTrends: boolean;
  modifiers: { company?: string; occurredAfter?: string; occurredBefore?: string; designLite?: boolean };
}
export type SelectionReason = "filtered_retrieval" | "adjacent_difficulty" | "reviewed_seed" | "approved_template" | "core_reviewed" | "recent_signal" | "coverage" | "difficulty" | "fallback";
export interface Candidate {
  hit: RetrievalHit; root: string; group: string; reason: SelectionReason; minutes: number; publicationClass?: string;
}
export interface Allocation {
  items: Candidate[]; coverage: Record<string,number>; difficultyDistribution: Record<Difficulty,number>;
  timeBudget: { setupWrapMinutes: number; probeReserveMinutes: number; questionMinutes: number; slackMinutes: number; totalMinutes: number };
  shortages: string[]; canConfirm: boolean;
}
export class PlannerError extends Error {
  constructor(public code: string, public status=400) { super(code); }
}
const validDate=(s: unknown): s is string => typeof s==="string" && /^\d{4}-\d{2}-\d{2}$/.test(s)
  && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10)===s;
export function validateSetup(value: unknown): Setup {
  if(!value || typeof value!=="object" || Array.isArray(value))throw new PlannerError("invalid_setup");
  const v=value as Record<string,unknown>;
  const keys=["role","level","taxonomyVersion","competencies","difficulty","mode","count","minutes","language","codeLanguage","modifiers","includeRecentTrends"];
  if(Object.keys(v).some(k=>!keys.includes(k)) || !ROLES.includes(v.role as Setup["role"]) || v.level!=="junior"
    || v.taxonomyVersion!=="junior-se-v1" || !["easy","standard","stretch"].includes(v.difficulty as string)
    || !["oral","coding","mixed"].includes(v.mode as string) || v.language!=="en" || !["python","javascript"].includes(v.codeLanguage as string)
    || typeof v.count!=="number" || !Number.isInteger(v.count) || v.count<3 || v.count>10
    || typeof v.minutes!=="number" || !Number.isInteger(v.minutes) || v.minutes<15 || v.minutes>60
    || !Array.isArray(v.competencies) || v.competencies.length<1 || v.competencies.length>4
    || new Set(v.competencies).size!==v.competencies.length || v.competencies.some(c=>!ROOTS.includes(c))
    || v.count<v.competencies.length || (v.includeRecentTrends!==undefined&&typeof v.includeRecentTrends!=="boolean"))throw new PlannerError("invalid_setup");
  const m=v.modifiers ?? {};
  if(!m || typeof m!=="object" || Array.isArray(m))throw new PlannerError("invalid_modifiers");
  const modifiers=m as Setup["modifiers"];
  if(Object.keys(m).some(k=>!["company","occurredAfter","occurredBefore","designLite"].includes(k))
    || (modifiers.company!==undefined && (typeof modifiers.company!=="string" || !modifiers.company.trim() || modifiers.company.length>200))
    || (modifiers.occurredAfter!==undefined && !validDate(modifiers.occurredAfter))
    || (modifiers.occurredBefore!==undefined && !validDate(modifiers.occurredBefore))
    || (modifiers.occurredAfter && modifiers.occurredBefore && modifiers.occurredAfter>modifiers.occurredBefore)
    || (modifiers.designLite!==undefined && typeof modifiers.designLite!=="boolean")
    || (modifiers.designLite && v.mode!=="mixed"))throw new PlannerError("invalid_modifiers");
  return {...v,includeRecentTrends:v.includeRecentTrends===true,competencies:[...v.competencies].sort(),modifiers:{...modifiers}} as Setup;
}
export const adjacent=(d: Difficulty): Difficulty => d==="standard"?"easy":"standard";
export function categories(setup: Setup): QuestionCategory[] {
  if(setup.mode==="oral")return ["conceptual-oral","scenario","debugging"];
  if(setup.mode==="coding")return ["coding","sql"];
  return ["conceptual-oral","scenario","debugging","coding","sql",...(setup.modifiers.designLite?["system-design-lite" as const]:[])];
}
// Untagged debugging remains spoken. Executable debugging requires later reviewed delivery metadata.
export const estimateMinutes=(category: QuestionCategory)=>category==="sql"?5:category==="coding" || category==="system-design-lite"?8:3;
export const isCode=(category: QuestionCategory)=>category==="coding" || category==="sql";
