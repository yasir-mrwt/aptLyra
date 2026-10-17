import { useCallback,useEffect,useRef,useState,type SyntheticEvent } from "react";
import { ROOT_LABELS,REPEAT_LABELS,REPEAT_HELP,PLANNER_ROLES,setupError,isPlannerDraft,type PlannerSetup } from "../planner/contracts";
import { getPlannerCapabilities,plannerMessage,previewPlan } from "../services/plannerApi";
import AIInterviewer from "./AIInterviewer";
import type { NewInterviewFormProps } from "../types/forms";
import { useSelector } from "react-redux";
import type { RootState } from "../app/store";
import { Link } from "react-router-dom";

export default function NewInterviewForm({preferredRole,onCreated,initialSetup}:NewInterviewFormProps) {
  const userId=useSelector((state:RootState)=>state.auth.user?.id || state.auth.user?._id);
  const storageKey=`aptlyra:planner-setup:${userId || "anonymous"}`;
  const edited=useRef(!!initialSetup);
  const [setup,setSetup]=useState<PlannerSetup>(()=>{
    if(initialSetup && !setupError(initialSetup))return initialSetup;
    try {const saved=JSON.parse(sessionStorage.getItem(storageKey)||"null");if(isPlannerDraft(saved))return saved;}catch { /* A malformed draft must not block planning. */ }
    return {role:PLANNER_ROLES.includes(preferredRole || "")?preferredRole!:PLANNER_ROLES[0],level:"junior",taxonomyVersion:"junior-se-v1",
    competencies:["dsa","programming"],difficulty:"standard",mode:"mixed",count:5,minutes:30,language:"en",codeLanguage:"javascript",modifiers:{},includeRecentTrends:false,repeatPolicy:"fresh-first"};});
  useEffect(()=>{if(initialSetup)try{sessionStorage.setItem(storageKey,JSON.stringify(initialSetup));}catch { /* Optional tab draft. */ }},[initialSetup,storageKey]);
  const [companies,setCompanies]=useState<string[]>([]),[eligibleReviewed,setEligibleReviewed]=useState<number|null>(null),[provisionalCount,setProvisionalCount]=useState(0),[capabilityError,setCapabilityError]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState<string|null>(null);
  const roleState=useSelector((state:RootState)=>state.role);
  const canReview=roleState.status==="ready"&&roleState.reviewerLinked&&["owner","admin","reviewer"].includes(roleState.role||"");
  const inFlight=useRef(false);
  const applyCapabilities=useCallback((data:Awaited<ReturnType<typeof getPlannerCapabilities>>)=>{setCompanies(data.companies);setEligibleReviewed(data.totalAvailable ?? data.eligibleReviewedQuestions);setProvisionalCount(data.provisionalQuestions);setCapabilityError(false);
    if(!edited.current) {
      let local:PlannerSetup|undefined;try {local=JSON.parse(sessionStorage.getItem(storageKey)||"null") || undefined;}catch { /* Optional browser draft. */ }
      const saved=local || data.savedSetup;
      try {if(isPlannerDraft(saved))setSetup(saved);}catch { /* Ignore malformed or obsolete saved drafts. */ }
    }
  },[storageKey]);
  useEffect(()=>{let alive=true;getPlannerCapabilities().then(data=>{if(alive)applyCapabilities(data);}).catch(()=>{if(alive)setCapabilityError(true);});return()=>{alive=false;};},[applyCapabilities]);
  const retryCapabilities=()=>{setCapabilityError(false);void getPlannerCapabilities().then(applyCapabilities).catch(()=>setCapabilityError(true));};
  const patch=(value:Partial<PlannerSetup>)=>{edited.current=true;setSetup(s=>{const next={...s,...value};try{sessionStorage.setItem(storageKey,JSON.stringify(next));}catch { /* Server preview still persists preferences. */ }return next;});setError(null);};
  const submit=async(e:SyntheticEvent)=>{
    e.preventDefault();if(inFlight.current)return;
    const invalid=setupError(setup);if(invalid){setError(invalid);return;}
    inFlight.current=true;setPending(true);setError(null);
    try {const plan=await previewPlan(setup);onCreated(plan.id);}
    catch(e){setError(plannerMessage(e));}finally{inFlight.current=false;setPending(false);}
  };
  const field="planner-field";
  return <section className="planner-studio"><div className="planner-heading"><div><p className="home-eyebrow">YOUR PRACTICE, YOUR PACE</p><h2>Plan a junior technical interview</h2><p>Start with what you want to practise. Review the plan before the clock starts.</p></div><AIInterviewer state={pending?"preparing":error?"error/retry":"idle"}/></div>
    <form onSubmit={submit} aria-label="Interview preferences" aria-busy={pending}><fieldset disabled={pending} className="planner-sections"><legend className="sr-only">Interview preferences</legend>
      <section className="planner-group" aria-labelledby="practice-format"><div className="planner-group-title"><span>01</span><div><h3 id="practice-format">Set the scene</h3><p>A manageable session for the role you’re preparing for.</p></div></div>
      <div className="grid gap-4 sm:grid-cols-2"><label>Role<select className={field} value={setup.role} onChange={e=>patch({role:e.target.value})}>{PLANNER_ROLES.map(r=><option key={r}>{r}</option>)}</select></label>
      <p className="planner-scope">Junior · 0–2 years · English</p>
      <label>Core mode<select className={field} value={setup.mode} onChange={e=>patch({mode:e.target.value as PlannerSetup["mode"],modifiers:{...setup.modifiers,designLite:false}})}><option value="oral">Oral technical</option><option value="coding">Coding</option><option value="mixed">Mixed</option></select></label>
      <label>Requested difficulty<select className={field} value={setup.difficulty} onChange={e=>patch({difficulty:e.target.value as PlannerSetup["difficulty"]})}>{["easy","standard","stretch"].map(d=><option key={d}>{d}</option>)}</select></label>
      <label>Question count<input className={field} type="number" min={3} max={10} value={setup.count} onChange={e=>patch({count:Number(e.target.value)})}/></label>
      <label>Duration (minutes)<input className={field} type="number" min={15} max={60} value={setup.minutes} onChange={e=>patch({minutes:Number(e.target.value)})}/></label>
      <label>Coding language<select className={field} value={setup.codeLanguage} onChange={e=>patch({codeLanguage:e.target.value as PlannerSetup["codeLanguage"]})}><option value="javascript">JavaScript</option><option value="python">Python</option></select></label></div>
      </section><section className="planner-group" aria-labelledby="practice-focus"><div className="planner-group-title"><span>02</span><div><h3 id="practice-focus">Choose your focus</h3><p>Mix foundations with the topics you want to feel more fluent in.</p></div></div><fieldset><legend>Choose 1–4 competencies</legend><div className="planner-topics">{Object.entries(ROOT_LABELS).map(([id,label])=><label key={id} className="planner-topic"><input type="checkbox" checked={setup.competencies.includes(id)} onChange={e=>patch({competencies:e.target.checked?[...setup.competencies,id]:setup.competencies.filter(c=>c!==id)})}/>{label}</label>)}</div></fieldset>
      </section><section className="planner-group" aria-labelledby="practice-repetition"><div className="planner-group-title"><span>03</span><div><h3 id="practice-repetition">Make each attempt count</h3><p>Choose how your saved interview history shapes the next selection.</p></div></div><div className="planner-repetition"><label htmlFor="question-repetition" className="font-semibold">Question repetition</label>
        <select id="question-repetition" aria-describedby="repetition-help" className={field} value={setup.repeatPolicy || "fresh-first"} onChange={e=>patch({repeatPolicy:e.target.value as PlannerSetup["repeatPolicy"]})}>{Object.entries(REPEAT_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>
        <p id="repetition-help" className="mt-2 text-sm">{REPEAT_HELP[setup.repeatPolicy || "fresh-first"]} History covers retained confirmed sessions; deleting a session removes its repeat protection.</p>
      </div>
      <label className="planner-option"><input type="checkbox" disabled={setup.mode!=="mixed"} checked={!!setup.modifiers.designLite} onChange={e=>patch({modifiers:{...setup.modifiers,designLite:e.target.checked}})}/>Allow one design-lite exercise (mixed mode)</label>
      <p className="text-sm text-surface-300">By default, plans use trusted starters and exact-version reviewed scoring guides. If too few questions fit, broaden your setup or explicitly allow provisional practice below. History restrictions still apply.</p><label className="planner-option"><input type="checkbox" checked={!!setup.includeRecentTrends} onChange={e=>patch({includeRecentTrends:e.target.checked})}/>Allow provisional practice questions (includes recent trends; numeric scoring may be unavailable)</label>
      </section><details className="planner-group planner-context"><summary>Optional context <span>Company, dates & availability</span></summary>
      {companies.length>0?<div className="grid gap-4 sm:grid-cols-3"><label>Company preference<select className={field} value={setup.modifiers.company || ""} onChange={e=>patch({modifiers:{...setup.modifiers,company:e.target.value || undefined}})}><option value="">Core practice</option>{companies.map(c=><option key={c}>{c}</option>)}</select></label>
        <label>Occurred on or after<input type="date" className={field} value={setup.modifiers.occurredAfter || ""} onChange={e=>patch({modifiers:{...setup.modifiers,occurredAfter:e.target.value || undefined}})}/></label>
        <label>Occurred on or before<input type="date" className={field} value={setup.modifiers.occurredBefore || ""} onChange={e=>patch({modifiers:{...setup.modifiers,occurredBefore:e.target.value || undefined}})}/></label></div>:<p>Company/date focus is unavailable: there are no eligible dated reports. Core practice uses the reviewed local corpus.</p>}
      <p>Resume and JD personalization are unavailable in this planner. Optional context never changes the core mode.</p>
      </details><div className="planner-submit">
      {eligibleReviewed===null&&<div aria-label="Loading question availability" aria-busy="true" className="h-16 animate-pulse rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-transparent">Checking reviewed question availability</div>}
      {capabilityError&&<p role="alert" className="rounded-xl border border-amber-300/25 bg-amber-950/20 p-4 text-sm">Question availability is temporarily unavailable. <button type="button" onClick={retryCapabilities} className="underline">Retry</button></p>}
      {eligibleReviewed===0&&<div role="status" className="rounded-xl border border-amber-300/25 bg-amber-950/20 p-4 text-sm"><p>{canReview?"No questions are currently available for this setup. Approve a new question for practice or check the starter bank retrieval status.":"Not enough questions are available for this setup yet."}</p>{canReview&&<Link to="/content-editorial" className="mt-2 inline-block text-cyan-200 underline">Open editorial review</Link>}{canReview&&provisionalCount>0&&<p className="mt-2 text-xs text-surface-400">{provisionalCount} practice questions exist; their feedback remains provisional until reviewed scoring is added.</p>}</div>}
      <p>We reserve 2 minutes for setup/wrap-up and 4 for probes. The preview explains count, difficulty and evidence shortages before you start.</p>
      {error && <p role="alert" className="planner-error" id="planner-error">{error}</p>}
      <button className="btn-primary planner-preview" type="submit" aria-describedby={error?"planner-error":undefined} disabled={pending}>{pending?"Preparing plan…":error?"Retry preview":"Preview interview plan"}</button>
    </div></fieldset></form></section>;
}
