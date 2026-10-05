// Character replacement is Phase 9. Components and state contracts do not depend on the name.
export const INTERVIEWER_PROFILE={displayName:"Ava"};
export type InterviewerState="idle"|"preparing"|"plan-ready"|"transitioning"|"error/retry"|"speaking"|"listening"|"evaluating"|"completed";
export const INTERVIEWER_STATE_LABELS:Record<InterviewerState,string>={idle:"Ready to plan",preparing:"Preparing your plan", "plan-ready":"Plan ready for review",transitioning:"Starting confirmed practice","error/retry":"Retry available",speaking:"Speaking",listening:"Listening",evaluating:"Processing answer",completed:"Completed"};
