import { useEffect, useState, type FormEvent } from "react";
import apiClient from "../services/apiClient";

type Submission={id:string;state:string;created_at:string};
export default function ShareInterviewExperience(){
  const [question,setQuestion]=useState(""),[role,setRole]=useState(""),[topic,setTopic]=useState(""),[notes,setNotes]=useState("");
  const [right,setRight]=useState(false),[ai,setAi]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const [items,setItems]=useState<Submission[]>([]);
  const refresh=async()=>setItems((await apiClient.get("/content-intelligence/submissions")).data);
  useEffect(()=>{void refresh().catch(()=>setMessage("Your submissions could not be loaded."));},[]);
  async function submit(event:FormEvent){event.preventDefault();setBusy(true);try{
    await apiClient.post("/content-intelligence/submissions",{question,role:role||undefined,topic:topic||undefined,notes:notes||undefined,rightToShare:right,aiProcessingConsent:ai});
    setQuestion("");setNotes("");setRight(false);setAi(false);setMessage("Question submitted for review.");await refresh();
  }catch{setMessage("Question could not be submitted. Check that it contains no private or confidential information and try again.");}finally{setBusy(false);}}
  return <section className="mx-auto max-w-3xl space-y-6 text-surface-100"><h1 className="text-3xl font-semibold">Submit question</h1>
    <p>Share a question you have the right to share. A reviewer will check it before it enters Interview Bank.</p>
    <form onSubmit={event=>void submit(event)} className="grid gap-4 rounded-xl border border-white/10 p-6">
      <label>Question<textarea required minLength={8} maxLength={1000} value={question} onChange={e=>setQuestion(e.target.value)} rows={4} className="mt-1 w-full rounded bg-slate-800 p-3"/></label>
      <label>Role (optional)<select value={role} onChange={e=>setRole(e.target.value)} className="mt-1 w-full rounded bg-slate-800 p-3"><option value="">Not specified</option>{["Software Engineer","Backend Developer","Full Stack Developer"].map(r=><option key={r}>{r}</option>)}</select></label>
      <label>Topic (optional)<input value={topic} maxLength={120} onChange={e=>setTopic(e.target.value)} className="mt-1 w-full rounded bg-slate-800 p-3"/></label>
      <label>Note / context (optional)<textarea value={notes} maxLength={4000} onChange={e=>setNotes(e.target.value)} className="mt-1 w-full rounded bg-slate-800 p-3"/></label>
      <label><input type="checkbox" required checked={right} onChange={e=>setRight(e.target.checked)}/> I have the right to share this question for interview practice.</label>
      <label><input type="checkbox" checked={ai} onChange={e=>setAi(e.target.checked)}/> Allow AI processing of this submission.</label>
      <button disabled={busy||!right} className="rounded bg-cyan-800 px-4 py-3 disabled:opacity-40">{busy?"Submitting…":"Submit"}</button>
    </form>{message&&<p role="status">{message}</p>}
    <section><h2>Your submissions</h2>{items.map(item=><article key={item.id} className="my-3 rounded border border-white/10 p-3">
      <span>{{review_required:"Needs review",quarantined:"Needs review",approved:"Reviewed",published:"Reviewed",rejected:"Rejected",withdrawn:"Withdrawn"}[item.state]||"Needs review"} · {new Date(item.created_at).toLocaleDateString()}</span>
      {["review_required","quarantined"].includes(item.state)&&<button className="ml-4 underline" disabled={busy} onClick={()=>{setBusy(true);void apiClient.delete(`/content-intelligence/submissions/${item.id}`).then(refresh).then(()=>setMessage("Submission withdrawn.")).catch(()=>setMessage("This submission could not be withdrawn.")).finally(()=>setBusy(false));}}>Withdraw</button>}
    </article>)}</section>
  </section>;
}
