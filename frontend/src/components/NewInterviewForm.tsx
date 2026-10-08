import { useEffect,useRef,useState,type SyntheticEvent } from "react";
import { ROOT_LABELS,PLANNER_ROLES,setupError,type PlannerSetup } from "../planner/contracts";
import { getPlannerCapabilities,plannerMessage,previewPlan } from "../services/plannerApi";
import AIInterviewer from "./AIInterviewer";
import type { NewInterviewFormProps } from "../types/forms";

export default function NewInterviewForm({preferredRole,onCreated}:NewInterviewFormProps) {
  const [setup,setSetup]=useState<PlannerSetup>({role:PLANNER_ROLES.includes(preferredRole || "")?preferredRole!:PLANNER_ROLES[0],level:"junior",taxonomyVersion:"junior-se-v1",
    competencies:["dsa","programming"],difficulty:"standard",mode:"mixed",count:5,minutes:30,language:"en",codeLanguage:"javascript",modifiers:{},includeRecentTrends:false});
  const [companies,setCompanies]=useState<string[]>([]),[pending,setPending]=useState(false),[error,setError]=useState<string|null>(null);
  const inFlight=useRef(false);
  useEffect(()=>{let alive=true;getPlannerCapabilities().then(data=>{if(alive)setCompanies(data.companies);}).catch(()=>undefined);return()=>{alive=false;};},[]);
  const patch=(value:Partial<PlannerSetup>)=>{setSetup(s=>({...s,...value}));setError(null);};
  const submit=async(e:SyntheticEvent)=>{
    e.preventDefault();if(inFlight.current)return;
    const invalid=setupError(setup);if(invalid){setError(invalid);return;}
    inFlight.current=true;setPending(true);setError(null);
    try {const plan=await previewPlan(setup);onCreated(plan.id);}
    catch(e){setError(plannerMessage(e));}finally{inFlight.current=false;setPending(false);}
  };
  const field="block w-full bg-surface-900 border border-white/20 rounded-xl p-3 mt-2";
  return <section className="glass-card rounded-3xl p-6 space-y-6"><h2 className="text-2xl text-white font-bold">Plan a junior technical interview</h2>
    <AIInterviewer state={pending?"preparing":error?"error/retry":"idle"}/>
    <form onSubmit={submit} className="space-y-6"><fieldset disabled={pending} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2"><label>Role<select className={field} value={setup.role} onChange={e=>patch({role:e.target.value})}>{PLANNER_ROLES.map(r=><option key={r}>{r}</option>)}</select></label>
      <p className="self-center">Junior · 0–2 years · English</p>
      <label>Core mode<select className={field} value={setup.mode} onChange={e=>patch({mode:e.target.value as PlannerSetup["mode"],modifiers:{...setup.modifiers,designLite:false}})}><option value="oral">Oral technical</option><option value="coding">Coding</option><option value="mixed">Mixed</option></select></label>
      <label>Requested difficulty<select className={field} value={setup.difficulty} onChange={e=>patch({difficulty:e.target.value as PlannerSetup["difficulty"]})}>{["easy","standard","stretch"].map(d=><option key={d}>{d}</option>)}</select></label>
      <label>Question count<input className={field} type="number" min={3} max={10} value={setup.count} onChange={e=>patch({count:Number(e.target.value)})}/></label>
      <label>Duration (minutes)<input className={field} type="number" min={15} max={60} value={setup.minutes} onChange={e=>patch({minutes:Number(e.target.value)})}/></label>
      <label>Coding language<select className={field} value={setup.codeLanguage} onChange={e=>patch({codeLanguage:e.target.value as PlannerSetup["codeLanguage"]})}><option value="javascript">JavaScript</option><option value="python">Python</option></select></label></div>
      <fieldset><legend>Choose 1–4 competencies</legend><div className="grid gap-3 sm:grid-cols-2 mt-3">{Object.entries(ROOT_LABELS).map(([id,label])=><label key={id} className="flex gap-3 items-center"><input type="checkbox" checked={setup.competencies.includes(id)} onChange={e=>patch({competencies:e.target.checked?[...setup.competencies,id]:setup.competencies.filter(c=>c!==id)})}/>{label}</label>)}</div></fieldset>
      <label className="flex gap-3"><input type="checkbox" disabled={setup.mode!=="mixed"} checked={!!setup.modifiers.designLite} onChange={e=>patch({modifiers:{...setup.modifiers,designLite:e.target.checked}})}/>Allow one design-lite exercise (mixed mode)</label>
      <label className="flex gap-3 items-center"><input type="checkbox" checked={!!setup.includeRecentTrends} onChange={e=>patch({includeRecentTrends:e.target.checked})}/>Include recent interview trends (up to 30% fresh/provisional; reviewed core stays first)</label>
      {companies.length>0?<div className="grid gap-4 sm:grid-cols-3"><label>Company preference<select className={field} value={setup.modifiers.company || ""} onChange={e=>patch({modifiers:{...setup.modifiers,company:e.target.value || undefined}})}><option value="">Core practice</option>{companies.map(c=><option key={c}>{c}</option>)}</select></label>
        <label>Occurred on or after<input type="date" className={field} value={setup.modifiers.occurredAfter || ""} onChange={e=>patch({modifiers:{...setup.modifiers,occurredAfter:e.target.value || undefined}})}/></label>
        <label>Occurred on or before<input type="date" className={field} value={setup.modifiers.occurredBefore || ""} onChange={e=>patch({modifiers:{...setup.modifiers,occurredBefore:e.target.value || undefined}})}/></label></div>:<p>Company/date focus is unavailable: there are no eligible dated reports. Core practice uses the reviewed local corpus.</p>}
      <p>Resume and JD personalization are unavailable in this planner. Optional context never changes the core mode.</p>
      <p>We reserve 2 minutes for setup/wrap-up and 4 for probes. The preview explains count, difficulty and evidence shortages before you start.</p>
      {error && <p role="alert" className="text-rose-300">{error}</p>}
      <button className="btn-primary" type="submit" disabled={pending}>{pending?"Preparing plan…":error?"Retry preview":"Preview plan"}</button>
    </fieldset></form></section>;
}
