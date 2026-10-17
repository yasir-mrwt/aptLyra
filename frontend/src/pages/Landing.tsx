import {useSelector} from "react-redux";
import {Link,useLocation,useNavigate} from "react-router-dom";
import {motion,useReducedMotion} from "framer-motion";
import type {RootState} from "../app/store";
import {BRAND} from "../constants/brand";
import AptlyraMark from "../components/AptlyraMark";
import HeroAnimation from "../components/HeroAnimation";
import NewInterviewForm from "../components/NewInterviewForm";
export default function Landing(){
 const roleState=useSelector((s:RootState)=>s.role);
 const {user,isInitializing}=useSelector((s:RootState)=>s.auth);const navigate=useNavigate(),location=useLocation();const reduced=useReducedMotion();
 const canReview=!!user && roleState?.userId===(user.id||user._id) && roleState.status==="ready" && roleState.canReview;
 const focusPlan=()=>{const node=document.getElementById("interview-setup");node?.scrollIntoView({behavior:reduced?"instant":"smooth",block:"start"});node?.focus({preventScroll:true});};
 return <div className="signature-home">
  <section className="home-hero" aria-labelledby="home-title"><motion.div className="home-hero-copy" initial={reduced?false:{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{duration:.45}}>
   <p className="home-eyebrow">APTLYRA / TECHNICAL INTERVIEW PRACTICE</p>
   <h1 id="home-title">Your next interview.<br/><span>Already rehearsed.</span></h1>
   <p className="home-intro">Find the words. Work through the code. Practise with Lyra before the real conversation, then use specific feedback to choose your next step.</p>
   <div className="home-hero-ctas flex flex-wrap gap-3 mt-8"><button onClick={focusPlan} className="btn-primary">Plan a technical interview <span aria-hidden="true">↗</span></button><a href="#how-it-works" className="home-secondary">See how it works <span aria-hidden="true">↓</span></a></div>
   <p className="home-scope">Built for your first software role.<br/>Oral, coding & mixed practice · Junior, 0–2 years</p>
  </motion.div><HeroAnimation/></section>
  {user&&<nav className="home-actions" aria-label="Practice actions">
   <button type="button" onClick={focusPlan}><span className="action-number">01</span><span><strong>Plan your practice</strong><small>Choose a focus and preview your questions.</small></span><span aria-hidden="true">↗</span></button>
   <Link to="/share-interview-experience"><span className="action-number">02</span><span><strong>Share a question</strong><small>Submit a draft for owner review.</small></span><span aria-hidden="true">↗</span></Link>
   <Link to={canReview?"/content-editorial":"/history"}><span className="action-number">03</span><span><strong>{canReview?"Review questions":"Revisit your practice"}</strong><small>{canReview?"Open the queue with your reviewer access.":"Resume an interview or read its report."}</small></span><span aria-hidden="true">↗</span></Link>
  </nav>}
  <section id="interview-setup" tabIndex={-1} aria-label="Interview setup" className="home-planner scroll-mt-28">
   {isInitializing?<p role="status">Restoring your saved session…</p>:user?<NewInterviewForm key={user.id||user._id} preferredRole={user.preferredRole} initialSetup={location.state?.plannerSetup} onCreated={id=>navigate(`/plans/${id}`)}/>:<div className="guest-plan"><div><p className="home-eyebrow">MAKE IT YOUR PRACTICE</p><h2 className="text-3xl font-semibold text-white mt-3">Make room for<br/>a better answer.</h2><p className="text-surface-400 mt-4 max-w-md">Choose your role, topics, language and time. Preview your questions before you begin. Sign in to create a real plan and keep your history.</p><div className="flex flex-wrap gap-3 mt-6"><Link to="/register" className="btn-primary">Join & plan an interview</Link><Link to="/login" className="home-secondary">Log in</Link></div></div><ol className="guest-plan-outline" aria-label="Planning overview"><li><span>01</span><div><strong>Your focus</strong><p>DSA, programming, databases and more</p></div></li><li><span>02</span><div><strong>Your format</strong><p>Oral, coding or a mix · JavaScript or Python</p></div></li><li><span>03</span><div><strong>Your next challenge</strong><p>Fresh first, only new, or revision practice</p></div></li></ol></div>}
  </section>
  <section id="how-it-works" className="home-process scroll-mt-28"><div><p className="home-eyebrow">A BETTER PRACTICE LOOP</p><h2>A little preparation.<br/>A clearer conversation.</h2></div><div className="space-y-8">{[
   ["01","Choose deliberately","Preview a plan shaped by your topics, available time and repetition preferences. Questions stay pinned when you confirm."],
   ["02","Show your thinking","Speak or type with Lyra. For coding, run your JavaScript or Python and save an explanation separately from your solution."],
   ["03","Understand the evidence","Review each answer, its feedback and scoring readiness. Verified tests, starter grades and provisional feedback are clearly distinguished."]
  ].map(([number,title,copy])=><article key={number} className="flex gap-5 border-t border-white/10 pt-5"><span className="font-mono text-primary-300">{number}</span><div><h3 className="text-xl text-white font-semibold">{title}</h3><p className="text-surface-400 mt-2 leading-relaxed">{copy}</p></div></article>)}</div></section>
  <section className="home-principle"><AptlyraMark className="w-14 h-14 shrink-0"/><div><h2 className="text-2xl text-white font-semibold">Confidence should have something behind it.</h2><p className="text-surface-400 mt-3 max-w-3xl">Aptlyra keeps practice feedback separate from human-reviewed scoring. When evidence is missing, you’ll see why. Your answers, progress and reports stay in your own account.</p></div></section>
  <footer className="home-footer"><a href="/animations/LICENSE.txt">Animation credits & license</a><Link to="/" className="flex items-center gap-2 font-bold text-white"><AptlyraMark className="w-7 h-7"/>{BRAND.name}</Link><p>© 2026 Aptlyra. All rights reserved.</p><div className="flex gap-5">{user?<><Link to="/history">History</Link><Link to="/analytics">Analytics</Link></>:<><Link to="/login">Log in</Link><Link to="/register">Join</Link></>}</div></footer>
 </div>;
}
