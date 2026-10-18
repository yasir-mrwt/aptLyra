import {Link} from 'react-router-dom';
import {motion,useReducedMotion} from 'framer-motion';
import {SlidersHorizontal,AudioLines,Code2,BarChart3,ArrowUpRight} from 'lucide-react';

const steps=[
 {title:'Choose your interview',icon:SlidersHorizontal,copy:'Choose your role, topics, format and time, then preview your interview plan.'},
 {title:'Meet Lyra',icon:AudioLines,copy:'Talk through your answers by voice or text, and check your transcript before submitting.'},
 {title:'Put code into practice',icon:Code2,copy:'When coding is included, solve questions in JavaScript or Python and run your solution.'},
 {title:'Find your next step',icon:BarChart3,copy:'Explore answer feedback, saved reports and practice progress to decide what to work on next.'},
];

export default function GettingStartedGuide({signedIn,onStart}:{signedIn:boolean;onStart:()=>void}){
 const reduced=useReducedMotion();
 return <section id="how-it-works" aria-labelledby="getting-started-title" className="getting-started scroll-mt-28">
  <div className="flex flex-wrap items-end justify-between gap-6">
   <div><p className="home-eyebrow">FROM FIRST QUESTION TO NEXT STEP</p><h2 id="getting-started-title" className="mt-3 text-3xl sm:text-4xl font-semibold text-white tracking-tight">How Aptlyra works</h2><p className="mt-3 max-w-xl text-surface-300">Four simple steps. Practice that fits your focus, at your pace.</p></div>
   {signedIn?<button type="button" onClick={onStart} className="btn-primary inline-flex items-center gap-2">Start an Interview<ArrowUpRight size={18} aria-hidden="true"/></button>:<Link to="/register" className="btn-primary inline-flex items-center gap-2">Get Started<ArrowUpRight size={18} aria-hidden="true"/></Link>}
  </div>
  <ol className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Your interview practice journey">
   {steps.map(({title,icon:Icon,copy},index)=><motion.li key={title} className="getting-started-card" initial={reduced?false:{opacity:0,y:8}} whileInView={{opacity:1,y:0}} viewport={{once:true,amount:.2}} transition={{duration:reduced?0:.25,delay:reduced?0:index*.04}}>
    <div className="mb-7 flex items-center justify-between"><span className="getting-started-icon"><Icon size={24} strokeWidth={1.5} aria-hidden="true"/></span><span className="font-mono text-sm text-surface-400" aria-hidden="true">0{index+1}</span></div>
    <h3 className="text-lg font-semibold text-white">{title}</h3><p className="mt-3 text-sm leading-6 text-surface-300">{copy}</p>
   </motion.li>)}
  </ol>
  <p className="mt-4 text-sm text-surface-400">Coding is optional. Scores describe your practice answers, not a professional certification.</p>
 </section>;
}
