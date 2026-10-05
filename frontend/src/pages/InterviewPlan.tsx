import { useEffect,useRef,useState } from "react";
import { useNavigate,useParams } from "react-router-dom";
import { confirmPlan,getPlan,plannerMessage } from "../services/plannerApi";
import type { PlanPreviewData } from "../planner/contracts";
import PlanPreview from "../components/PlanPreview";
import AIInterviewer from "../components/AIInterviewer";
export default function InterviewPlan() {
  const {planId}=useParams(),navigate=useNavigate();
  const [plan,setPlan]=useState<PlanPreviewData|null>(null),[error,setError]=useState<string|null>(null),[confirming,setConfirming]=useState(false),[retry,setRetry]=useState(0);
  const busy=useRef(false);
  useEffect(()=>{let alive=true;if(planId)getPlan(planId).then(p=>{if(alive)setPlan(p);}).catch(e=>{if(alive)setError(plannerMessage(e));});return()=>{alive=false;};},[planId,retry]);
  const confirm=async()=>{if(!plan || busy.current)return;if(plan.confirmedAt){navigate(`/interview/${plan.sessionId}`);return;}
    busy.current=true;setConfirming(true);setError(null);
    try {const result=await confirmPlan(plan);navigate(`/interview/${result.sessionId}`);}
    catch(e){setError(plannerMessage(e));}finally{busy.current=false;setConfirming(false);}
  };
  if(!plan)return <section className="p-6"><AIInterviewer state={error?"error/retry":"preparing"}/>{error && <><p role="alert">{error}</p><button onClick={()=>{setError(null);setRetry(n=>n+1);}}>Retry loading preview</button><button onClick={()=>navigate('/dashboard')}>Change setup</button></>}</section>;
  return <PlanPreview plan={plan} confirming={confirming} error={error} onConfirm={()=>void confirm()} onEdit={()=>navigate('/dashboard')}/>;
}
