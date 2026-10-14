import {useEffect,useState} from "react";
import {useDispatch,useSelector} from "react-redux";
import {Link,useNavigate} from "react-router-dom";
import type {AppDispatch,RootState} from "../app/store";
import {getSession,deleteSession} from "../features/session/sessionSlice";
import SessionCard from "../components/SessionCard";
import ConfirmModal from "../components/ConfirmModal";
import type {Session} from "../types/session";
export default function InterviewHistory(){
 const dispatch=useDispatch<AppDispatch>(),navigate=useNavigate();const {sessions,isLoading,isError,message,pagination}=useSelector((s:RootState)=>s.session);
 const [status,setStatus]=useState("all"),[remove,setRemove]=useState<string|null>(null),[deleting,setDeleting]=useState(false),[error,setError]=useState("");
 useEffect(()=>{void dispatch(getSession());},[dispatch]);
 const open=(s:Session)=>{if(s.status==="completed")navigate(`/review/${s._id}`);else if(s.status==="in-progress")navigate(`/interview/${s._id}`);else if(s.status==="pending"&&s.planId)navigate(`/plans/${s.planId}`);};
 const confirm=async()=>{if(!remove||deleting)return;setDeleting(true);try{await dispatch(deleteSession(remove)).unwrap();setRemove(null);}catch{setError("Deletion failed. Your saved history is unchanged; please retry.");}finally{setDeleting(false);}};
 return <section className="max-w-5xl mx-auto space-y-6"><div className="flex flex-wrap justify-between gap-4"><div><p className="home-eyebrow">YOUR PRACTICE RECORD</p><h1 className="text-4xl font-bold text-white mt-2">Interview history</h1></div><Link to="/dashboard#interview-setup" className="btn-primary self-center">Plan an interview</Link></div>
 <p className="text-surface-400">Resume an interview or open its saved report. Individual starter scores and provisional feedback remain separate from reviewed aggregates. Failed and cancelled sessions retain their actual status.</p>
 <label className="block">Status <select className="ml-3 rounded-xl bg-surface-900 border border-white/20 p-3" value={status} onChange={e=>setStatus(e.target.value)}>{["all","completed","in-progress","pending","failed","cancelled"].map(s=><option value={s} key={s}>{s==="all"?"All loaded interviews":s}</option>)}</select></label>
 {(isError||error)&&<p role="alert">{error||message} <button className="underline" onClick={()=>void dispatch(getSession())}>Reload history</button></p>}
 {isLoading&&<p role="status">Loading saved interviews…</p>}
 <div className="grid gap-5 md:grid-cols-2">{sessions.filter(s=>status==="all"||s.status===status).map(session=><SessionCard key={session._id} session={session} onClick={()=>open(session)} onDelete={(_e,id)=>setRemove(id)}/>)}</div>
 {!isLoading&&!sessions.filter(s=>status==="all"||s.status===status).length&&<p>No interviews in this loaded selection.</p>}
 {pagination&&pagination.currentPage<pagination.totalPages&&<button className="btn-secondary" disabled={isLoading} onClick={()=>void dispatch(getSession({page:pagination.currentPage+1}))}>Load more interviews</button>}
 <ConfirmModal isOpen={!!remove} onCancel={()=>{if(!deleting)setRemove(null);}} onConfirm={()=>void confirm()} title="Delete this interview?" message="This removes its saved answers and report. It also removes this session from question repetition history." confirmText={deleting?"Deleting…":"Delete interview"}/>
 </section>;
}
