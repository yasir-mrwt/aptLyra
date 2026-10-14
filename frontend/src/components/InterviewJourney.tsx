import {useEffect,useState} from "react";
import {motion,useReducedMotion} from "framer-motion";
const steps=[{title:"A question worth thinking about",detail:"Choose the topics. Preview the questions. Know what you’re practising."},{title:"Make your reasoning visible",detail:"Write code, run it, and explain the choices behind your solution."},{title:"Turn evidence into your next step",detail:"Read specific feedback. See what was verified and what remains uncertain."}];
/** Original SVG composition. Illustrative process, never a simulated live score. */
export default function InterviewJourney(){
 const reduced=useReducedMotion();const [step,setStep]=useState(0);
 useEffect(()=>{if(reduced)return;const timers=[window.setTimeout(()=>setStep(1),1800),window.setTimeout(()=>setStep(2),3600)];return()=>timers.forEach(clearTimeout);},[reduced]);
 const accent=(n:number)=>step===n?"#c4b5fd":"#71717a";
 return <figure className="journey-scene" aria-label="Illustration of question, reasoning and evidence. No live scores.">
  <div className="flex items-center justify-between px-5 pt-5 text-xs text-surface-400"><span className="font-mono tracking-widest">THE PRACTICE WORKBENCH</span><span>Illustration</span></div>
  <svg viewBox="0 0 620 380" className="w-full" role="img" aria-label="A question connects to a code workspace and an evidence map">
   <defs><pattern id="journey-grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".7" fill="#52525b" opacity=".5"/></pattern></defs>
   <rect x="0" y="0" width="620" height="380" fill="url(#journey-grid)"/>
   <path d="M158 101 C290 101 170 208 301 208 S420 302 509 302" fill="none" stroke="#3f3f46" strokeWidth="2"/>
   <motion.path d="M158 101 C290 101 170 208 301 208 S420 302 509 302" fill="none" stroke="#a78bfa" strokeWidth="2" initial={false} animate={{pathLength:reduced?1:(step+1)/3}} transition={{duration:reduced?0:.65}}/>
   <g transform="translate(28 35)"><rect width="209" height="104" rx="14" fill="#15151b" stroke={accent(0)}/><text x="17" y="29" fill={accent(0)} fontSize="11" fontFamily="monospace">01 / QUESTION</text><text x="17" y="57" fill="#fafafa" fontSize="17">What makes a solution</text><text x="17" y="81" fill="#fafafa" fontSize="17">worth trusting?</text></g>
   <motion.g animate={{y:reduced?0:step===1?-5:0}} transition={{duration:.35}}><rect x="136" y="156" width="317" height="137" rx="14" fill="#111116" stroke={accent(1)}/><circle cx="154" cy="176" r="3" fill="#a78bfa"/><circle cx="166" cy="176" r="3" fill="#52525b"/><circle cx="178" cy="176" r="3" fill="#52525b"/><text x="428" y="181" textAnchor="end" fill={accent(1)} fontSize="11" fontFamily="monospace">02 / REASONING</text><path d="M136 190H453" stroke="#27272a"/><text x="154" y="215" fill="#c4b5fd" fontFamily="monospace" fontSize="14">function explain(idea) {'{'}</text><text x="172" y="241" fill="#d4d4d8" fontFamily="monospace" fontSize="14">return code + reasoning;</text><text x="154" y="269" fill="#c4b5fd" fontFamily="monospace" fontSize="14">{'}'}</text></motion.g>
   <g transform="translate(365 39)"><circle cx="97" cy="43" r="37" stroke="#3f3f46" fill="none"/><path d="M60 43L97 6 134 43 97 80Z M60 43H134 M97 6V80" stroke="#52525b" fill="none"/><motion.path d="M70 43L97 15 127 43 97 70Z" stroke="#a78bfa" fill="#8b5cf6" fillOpacity=".12" initial={false} animate={{opacity:step===2?1:.35}}/><circle cx="97" cy="15" r="4" fill="#a5f3fc"/><circle cx="127" cy="43" r="4" fill="#c4b5fd"/><text x="97" y="105" textAnchor="middle" fontSize="11" fill="#a1a1aa">A clearer picture of your skills</text></g>
   <g transform="translate(353 300)"><rect width="238" height="70" rx="12" fill="#15151b" stroke={accent(2)}/><text x="15" y="25" fontSize="11" fill={accent(2)} fontFamily="monospace">03 / EVIDENCE</text><text x="15" y="46" fontSize="14" fill="#e4e4e7">Correctness · reasoning</text><text x="15" y="62" fontSize="12" fill="#a1a1aa">Your next practice step</text></g>
   <text x="30" y="340" fontFamily="monospace" fontSize="11" fill="#a1a1aa">QUESTION → PRACTICE → REFLECT</text>
  </svg>
  <figcaption className="px-5 pb-5"><div className="flex gap-2 mb-4">{["Question","Reasoning","Evidence"].map((label,index)=><button key={label} type="button" aria-pressed={step===index} onClick={()=>setStep(index)} className={`journey-step ${step===index?"selected":""}`}>{index+1}. {label}</button>)}</div><h2 className="text-white font-semibold">{steps[step].title}</h2><p className="text-sm text-surface-400 mt-2 min-h-10">{steps[step].detail}</p></figcaption>
 </figure>;
}
