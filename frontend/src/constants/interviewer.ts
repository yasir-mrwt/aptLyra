import {BRAND} from "./brand";
// Identity can change without replacing the Phase 9 character design.
export const INTERVIEWER_PROFILE={displayName:BRAND.interviewer};
export type InterviewerState="idle"|"preparing"|"plan-ready"|"transitioning"|"error/retry"|"speaking"|"listening"|"evaluating"|"completed";
export const INTERVIEWER_STATE_LABELS:Record<InterviewerState,string>={idle:"Ready to plan",preparing:"Preparing your plan", "plan-ready":"Plan ready for review",transitioning:"Starting confirmed practice","error/retry":"Retry available",speaking:"Speaking",listening:"Listening",evaluating:"Processing answer",completed:"Completed"};
