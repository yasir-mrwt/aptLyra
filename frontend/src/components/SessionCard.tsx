import {
    Layout,
    Server,
    Cloud,
    BarChart3,
    Palette,
    Smartphone,
    Cpu,
    ShieldCheck,
    Gamepad2,
    Database,
    // eslint-disable-next-line no-shadow-restricted-names
    Infinity,
    Code2,
    Box,
    Atom,
    Hexagon,
    Terminal,
    Coffee,
    Workflow
} from "lucide-react";

import type { SessionCardProps } from "../types/components";

const SessionCard = ({ session, onClick, onDelete }: SessionCardProps) => {
    const isDeletable = session.status !== 'pending';

    const renderIcon = () => {
        const role = session.role || '';
        const size = 28;
        const className = "transition-transform group-hover:scale-110 duration-500";

        if (role.includes('Python')) return <Code2 size={size} className={className} />
        if (role.includes('Java')) return <Coffee size={size} className={className} />
        if (role.includes('C++') || role.includes('C#')) return <Terminal size={size} className={className} />
        if (role.includes('JavaScript') || role.includes('TypeScript')) return <Code2 size={size} className={className} />
        if (role.includes('React')) return <Atom size={size} className={className} />
        if (role.includes('Node')) return <Hexagon size={size} className={className} />
        if (role.includes('SQL') || role.includes('MongoDB') || role.includes('Database')) return <Database size={size} className={className} />
        if (role.includes('Docker')) return <Box size={size} className={className} />
        if (role.includes('Kubernetes')) return <Infinity size={size} className={className} />
        if (role.includes('AWS') || role.includes('Azure') || role.includes('Cloud')) return <Cloud size={size} className={className} />
        if (role.includes('Mobile') || role.includes('Android') || role.includes('iOS')) return <Smartphone size={size} className={className} />
        if (role.includes('Game')) return <Gamepad2 size={size} className={className} />
        if (role.includes('Security') || role.includes('Cyber')) return <ShieldCheck size={size} className={className} />
        if (role.includes('ML') || role.includes('Machine Learning') || role.includes('AI')) return <Cpu size={size} className={className} />
        if (role.includes('Data')) return <BarChart3 size={size} className={className} />
        if (role.includes('DevOps')) return <Infinity size={size} className={className} />
        if (role.includes('Frontend') || role.includes('Web')) return <Layout size={size} className={className} />
        if (role.includes('Backend')) return <Server size={size} className={className} />
        if (role.includes('Full Stack') || role.includes('MERN') || role.includes('MEAN')) return <Workflow size={size} className={className} />
        if (role.includes('Design') || role.includes('UI/UX')) return <Palette size={size} className={className} />

        return <Terminal size={size} className={className} />
    }

    const practice=session.individualPractice;
    return <article className="glass-card rounded-3xl p-6 space-y-5 border border-white/10">
      <header className="flex gap-4 items-start"><div className="text-primary-300 mt-1">{renderIcon()}</div><div className="min-w-0 flex-1"><h3 className="font-display text-xl font-semibold text-white break-words">{session.role}</h3><p className="text-sm text-surface-300 mt-1">{session.level} · {session.createdAt?new Date(session.createdAt).toLocaleDateString():'Date unavailable'}{session.company&&session.company!=='general'?` · ${session.company}`:''}</p></div><span className="rounded-full bg-white/5 px-3 py-1 text-xs text-surface-300">{session.status}</span></header>
      {session.status==='completed'&&<><div><p className="text-sm text-surface-300">Individual practice score</p><p className="text-3xl font-semibold text-white mt-1">{practice?.mean??'Not available'}{practice?.mean!=null&&<span className="text-base text-surface-400"> /100</span>}</p><p className="text-sm text-surface-300 mt-2">{practice?`${practice.scored}/${practice.total} answers scored · ${practice.unanswered??0} unanswered`:`${session.individualScoredAnswers??0} individually scored answers`}</p></div><details className="text-sm text-surface-300"><summary className="cursor-pointer">Scoring methodology</summary><p className="mt-2">Reviewed aggregate: {session.overallScore==null?'Not available':`${session.overallScore.toFixed(1)}/100`}. Only eligible reviewed originals contribute. Individual feedback remains available in the report.</p>{practice&&<p>{practice.provisional??0} provisional answers</p>}</details></>}
      <div className="flex justify-between gap-3 pt-4 border-t border-white/10"><button className="btn-secondary px-4 py-2" onClick={()=>onClick(session)}>{session.status==='completed'?'Open report':session.status==='cancelled'?'View interview':'Continue interview'}</button><button aria-label="Delete interview" disabled={!isDeletable} className="text-sm text-surface-400 hover:text-rose-300 disabled:opacity-40" onClick={event=>{if(isDeletable)onDelete(event,session._id);}}>Delete</button></div>
    </article>;
};
export default SessionCard;
