import InterviewerAvatar from "./InterviewerAvatar";
import { INTERVIEWER_PROFILE,INTERVIEWER_STATE_LABELS,type InterviewerState } from "../constants/interviewer";
/** Shared name-neutral planning presentation; state follows actual requests only. */
export default function AIInterviewer({state}:{state:InterviewerState}) {
  return <div className="flex items-center gap-4"><InterviewerAvatar speaking={false} amplitude={0} size={76}/>
    <div><p>{INTERVIEWER_PROFILE.displayName} · AI interviewer</p><p role="status" aria-live="polite">{INTERVIEWER_STATE_LABELS[state]}</p></div></div>;
}
