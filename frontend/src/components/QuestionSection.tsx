import React from "react";

interface QuestionSectionProps {
    index: number;
    text: string;
    /** Set when this question is a cross-questioning probe of an earlier answer. */
    followUpOf?: number;
}

const QuestionSection: React.FC<QuestionSectionProps> = ({ index, text, followUpOf }) => {
    const isFollowUp = followUpOf !== undefined && followUpOf !== null;

    return (
        <div className={`glass-card p-10 rounded-[2.5rem] h-full relative overflow-hidden group ${isFollowUp ? "border-amber-500/20" : "border-white/5"}`}>
            <div className="absolute top-0 right-0 p-10 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity pointer-events-none">
                <svg width="200" height="200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.5"><path d="M12 2v20M2 12h20M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z"/></svg>
            </div>

            {isFollowUp ? (
                <span className="bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[9px] font-black uppercase tracking-[0.3em] px-4 py-1.5 rounded-full shadow-[0_0_20px_rgba(245,158,11,0.1)]">
                    Follow-up Probe :: Q{followUpOf + 1}
                </span>
            ) : (
                <span className="bg-primary-500/10 border border-primary-500/20 text-primary-400 text-[9px] font-black uppercase tracking-[0.3em] px-4 py-1.5 rounded-full shadow-[0_0_20px_rgba(139,92,246,0.1)]">
                    Technical Briefing :: {index + 1}
                </span>
            )}
            <h2 className="text-lg sm:text-xl font-bold leading-relaxed mt-6 text-white tracking-tight max-w-4xl">
                {text}
            </h2>
        </div>
    );
};

export default QuestionSection;
