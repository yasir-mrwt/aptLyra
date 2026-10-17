export const ROOT_LABELS: Record<string,string>={dsa:"Data Structures & Algorithms",oop:"Object-Oriented Programming","dbms-sql":"DBMS / SQL",os:"Operating Systems",networks:"Computer Networks","backend-web":"Backend / Web Fundamentals","design-lite":"Basic System Design",programming:"Programming / Coding"};
export const PLANNER_ROLES=["Software Engineer","Backend Developer","Full Stack Developer"];
export const REPEAT_LABELS={"fresh-first":"Fresh first", "only-new":"Only new to me", revision:"Revision practice"};
export const REPEAT_HELP={"fresh-first":"Prefer unseen questions; use older repeats when needed.","only-new":"Never repeat retained confirmed assignments. If too few are available, change your setup before starting.",revision:"Revisit earlier questions, prioritizing older reviewed weaknesses. With little history, use fresh questions."};
export interface PlannerSetup {
  repeatPolicy?: keyof typeof REPEAT_LABELS;
  role: string; level:"junior"; taxonomyVersion:"junior-se-v1"; competencies:string[];
  difficulty:"easy"|"standard"|"stretch"; mode:"oral"|"coding"|"mixed";count:number;minutes:number;
  language:"en";codeLanguage:"python"|"javascript";
  modifiers:{company?:string;occurredAfter?:string;occurredBefore?:string;designLite?:boolean};
  includeRecentTrends?:boolean;
}
export interface PlanPreviewData {
  selection?:{policy:keyof typeof REPEAT_LABELS;newCount:number;repeatedCount:number;historyWindow:string};
  id:string;sessionId:string;revision:number;status:string;role:string;mode:string;setup:PlannerSetup;
  effectiveCount:number;requestedCount:number;effectiveMinutes:number;requestedMinutes:number;
  coverage:Record<string,number>;difficultyDistribution:Record<string,number>;
  timeBudget:{setupWrapMinutes:number;probeReserveMinutes:number;questionMinutes:number;slackMinutes:number};
  shortages:string[];canConfirm:boolean;confirmedAt:string|null;evaluationMode:"legacy"|"rubric-v1";
  items:{repeat?:{repeated:boolean;reason:string};id:string;position:number;competency:string;category:string;difficulty:string;selectionReason:string;publicationClass?:string;inventoryClass?:string;estimatedMinutes:number;available:boolean}[];
}
export function setupError(s:PlannerSetup):string|null {
  if(s.repeatPolicy!==undefined && !Object.hasOwn(REPEAT_LABELS,s.repeatPolicy))return "Choose a supported question repetition policy.";
  if(s.competencies.length<1 || s.competencies.length>4)return "Choose between one and four competencies.";
  if(!Number.isInteger(s.count) || s.count<3 || s.count>10 || s.count<s.competencies.length)return "Choose 3–10 questions and at least one per competency.";
  if(!Number.isInteger(s.minutes) || s.minutes<15 || s.minutes>60)return "Choose a duration between 15 and 60 minutes.";
  if(!PLANNER_ROLES.includes(s.role))return "Choose a supported junior role.";
  if(s.modifiers.occurredAfter && s.modifiers.occurredBefore && s.modifiers.occurredAfter>s.modifiers.occurredBefore)return "The occurrence date range is reversed.";
  return null;
}
export const shortageLabel=(code:string):string=>({
  recent_signal_provisional_selected:"Recently sourced, human-approved practice questions are included. Their scoring stays provisional until a matching evidence-backed guide is approved.",
  time_or_mode_coverage_shortage:"The available questions cannot cover every selected competency and mode within this duration. Change your topics, mode or duration.",
  count_reduced_for_time_or_evidence:"The question count was reduced to fit your time budget or available evidence. Every selected competency still has coverage.",
  difficulty_target_shortage:"Available questions cannot meet the 60% requested / 40% adjacent difficulty target. Review the actual distribution below.",
  reviewed_fallback_used:"Some questions use the trusted starter bank to cover the requested topics.",
  company_date_evidence_unavailable_constraints_preserved:"No permitted evidence meets your company/date preferences. These constraints were preserved. Explicitly change your preferences to try core practice.",
  plan_stale_preview_again:"This plan's evidence or corpus changed. Create a fresh preview before starting."
}[code] || (code==="revision_fresh_fallback"?"No compatible earlier questions were selected; this revision plan uses fresh questions.":code.startsWith("only_new_shortage:")?`Only ${code.split(":")[1]} of ${code.split(":")[2]} requested new questions fit this setup. Broaden competencies/difficulty, choose Fresh first, or wait for more approved questions. Confirmation is disabled.`:code.startsWith("competency_evidence_shortage:")?`No reviewed questions are currently available for ${ROOT_LABELS[code.split(":")[1]]||"one selected competency"}. ${code.split(":")[1] in ROOT_LABELS?"A reviewer can add grounded questions through editorial review.":"Change your competency selection or try again later."}`:code.startsWith("retrieval_unavailable:")?"Semantic retrieval is temporarily unavailable. Structured selection from the trusted starter bank was used; dynamic questions were excluded.":code));

/** Drafts may be incomplete (zero selected topics or an empty numeric field).
 * Validate shape and enums without applying submission completeness rules. */
export function isPlannerDraft(value:unknown):value is PlannerSetup {
  if(!value||typeof value!=="object")return false;
  const s=value as PlannerSetup;
  return PLANNER_ROLES.includes(s.role)&&s.level==="junior"&&s.taxonomyVersion==="junior-se-v1"&&
    Array.isArray(s.competencies)&&s.competencies.every(c=>typeof c==="string"&&Object.hasOwn(ROOT_LABELS,c))&&
    ["oral","coding","mixed"].includes(s.mode)&&["easy","standard","stretch"].includes(s.difficulty)&&
    Number.isFinite(s.count)&&Number.isFinite(s.minutes)&&s.language==="en"&&["javascript","python"].includes(s.codeLanguage)&&
    !!s.modifiers&&typeof s.modifiers==="object"&&(!s.repeatPolicy||Object.hasOwn(REPEAT_LABELS,s.repeatPolicy));
}
