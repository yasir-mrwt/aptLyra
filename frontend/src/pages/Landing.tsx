import {useSelector} from "react-redux";
import {Link,useLocation,useNavigate} from "react-router-dom";
import {motion,useReducedMotion} from "framer-motion";
import type {RootState} from "../app/store";
import {BRAND} from "../constants/brand";
import AptlyraMark from "../components/AptlyraMark";
import InterviewJourney from "../components/InterviewJourney";
import NewInterviewForm from "../components/NewInterviewForm";
export default function Landing(){
 const {user,isInitializing}=useSelector((s:RootState)=>s.auth);const navigate=useNavigate(),location=useLocation();const reduced=useReducedMotion();
 const focusPlan=()=>{const node=document.getElementById("interview-setup");node?.scrollIntoView({behavior:reduced?"instant":"smooth",block:"start"});node?.focus({preventScroll:true});};
 return <div className="signature-home">
  <section className="home-hero" aria-labelledby="home-title"><motion.div initial={reduced?false:{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{duration:.45}}>
   <p className="home-eyebrow">APTLYRA / YOUR NEXT ATTEMPT STARTS HERE</p>
   <h1 id="home-title">Practice with evidence.<br/><span>Improve with confidence.</span></h1>
   <p className="home-intro">You know more than a score can say. Work through junior technical interviews with Lyra, make your reasoning visible, and discover what to practise next.</p>
   <div className="flex flex-wrap gap-3 mt-8"><button onClick={focusPlan} className="btn-primary">Plan a technical interview <span aria-hidden="true">↗</span></button><a href="#how-it-works" className="home-secondary">See how it works <span aria-hidden="true">↓</span></a></div>
   <p className="text-sm text-surface-400 mt-5">Oral, coding & mixed practice · Junior, 0–2 years</p>
  </motion.div><InterviewJourney/></section>
  <section id="interview-setup" tabIndex={-1} aria-label="Interview setup" className="home-planner scroll-mt-28">
   {isInitializing?<p role="status">Restoring your saved session…</p>:user?<NewInterviewForm key={user.id||user._id} preferredRole={user.preferredRole} initialSetup={location.state?.plannerSetup} onCreated={id=>navigate(`/plans/${id}`)}/>:<div className="guest-plan"><div><p className="home-eyebrow">MAKE IT YOUR PRACTICE</p><h2 className="text-3xl font-semibold text-white mt-3">A focused interview.<br/>A useful next step.</h2><p className="text-surface-400 mt-4 max-w-md">Choose your role, topics, language and time. Preview your questions before you begin. Sign in to create a real plan and keep your history.</p><div className="flex flex-wrap gap-3 mt-6"><Link to="/register" className="btn-primary">Join & plan an interview</Link><Link to="/login" className="home-secondary">Log in</Link></div></div><ol className="guest-plan-outline" aria-label="Planning overview"><li><span>01</span><div><strong>Your focus</strong><p>DSA, programming, databases and more</p></div></li><li><span>02</span><div><strong>Your format</strong><p>Oral, coding or a mix · JavaScript or Python</p></div></li><li><span>03</span><div><strong>Your next challenge</strong><p>Fresh first, only new, or revision practice</p></div></li></ol></div>}
  </section>
  <section id="how-it-works" className="home-process scroll-mt-28"><div><p className="home-eyebrow">A BETTER PRACTICE LOOP</p><h2>Go beyond<br/>“Did I get it right?”</h2></div><div className="space-y-8">{[
   ["01","Choose deliberately","Preview a plan shaped by your topics, available time and repetition preferences. Questions stay pinned when you confirm."],
   ["02","Show your thinking","Speak or type with Lyra. For coding, run your JavaScript or Python and save an explanation separately from your solution."],
   ["03","Understand the evidence","Review each answer, its feedback and scoring readiness. Verified tests, starter grades and provisional feedback are clearly distinguished."]
  ].map(([number,title,copy])=><article key={number} className="flex gap-5 border-t border-white/10 pt-5"><span className="font-mono text-primary-300">{number}</span><div><h3 className="text-xl text-white font-semibold">{title}</h3><p className="text-surface-400 mt-2 leading-relaxed">{copy}</p></div></article>)}</div></section>
  <section className="home-principle"><AptlyraMark className="w-14 h-14 shrink-0"/><div><h2 className="text-2xl text-white font-semibold">Confidence should have something behind it.</h2><p className="text-surface-400 mt-3 max-w-3xl">Aptlyra keeps practice feedback separate from human-reviewed scoring. When evidence is missing, you’ll see why. Your answers, progress and reports stay in your own account.</p></div></section>
  <footer className="home-footer"><Link to="/" className="flex items-center gap-2 font-bold text-white"><AptlyraMark className="w-7 h-7"/>{BRAND.name}</Link><p>Original Aptlyra work by Muhammad Yasir · © 2026</p><div className="flex gap-5">{user?<><Link to="/history">History</Link><Link to="/analytics">Analytics</Link></>:<><Link to="/login">Log in</Link><Link to="/register">Join</Link></>}</div></footer>
 </div>;
}
