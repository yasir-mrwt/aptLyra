import React, { useState, useEffect } from "react";

interface InterviewHeaderProps {
    role: string;
    startTime?: string;
    questionsCount: number;
    currentQuestionIndex: number;
    submittedLocal: Record<number, boolean>;
    questions: { isEvaluated: boolean; isSubmitted: boolean }[];
    handleNavigation: (index: number) => void;
    handleFinishInterview: () => void;
    isLoading: boolean;
    finishDisabled?: boolean;
    company?: string;
}

const InterviewHeader: React.FC<InterviewHeaderProps> = ({
    role,
    startTime,
    questions,
    currentQuestionIndex,
    submittedLocal,
    handleNavigation,
    handleFinishInterview,
    isLoading, finishDisabled,
    company
}) => {
    const [elapsedTime, setElapsedTime] = useState("00:00");

    useEffect(() => {
        if (!startTime) return;
        const start = new Date(startTime).getTime();
        const updateTimer = () => {
            const now = new Date().getTime();
            const diff = Math.max(0, now - start);
            const hours = Math.floor(diff / 3600000);
            const mins = Math.floor((diff % 3600000) / 60000);
            const secs = Math.floor((diff % 60000) / 1000);

            const hoursStr = hours > 0 ? `${hours.toString().padStart(2, '0')}:` : '00:';
            setElapsedTime(`${hoursStr}${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
        };
        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [startTime]);

    return (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 sm:gap-4 glass-card p-6 sm:px-8 rounded-3xl mb-10 mt-6 border-white/5 relative z-40">
            <div className="w-full">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 mb-1">
                    <h1 className="text-xl font-black text-white tracking-tight uppercase leading-none flex items-center gap-3 wrap-break-word">
                        {role}
                        {company && company !== 'general' && (
                            <span aria-label="Company" className="text-[10px] bg-primary-500/20 text-primary-400 border border-primary-500/30 px-2 py-0.5 rounded-md tracking-widest shrink-0">
                                {company.toUpperCase()}
                            </span>
                        )}
                    </h1>
                    {startTime && (
                        <div className="flex items-center self-start sm:self-auto gap-2 px-3 py-1.5 rounded-full bg-surface-900 border border-white/5 shadow-inner shrink-0">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            <span className="text-xs font-black tracking-widest text-surface-300 tabular-nums font-mono">{elapsedTime}</span>
                        </div>
                    )}
                </div>
                <div className="flex flex-wrap gap-3 mt-4 sm:mt-5">
                    {questions.map((q, i) => (
                        <div key={i}
                            onClick={() => handleNavigation(i)}
                            className={`w-3.5 h-3.5 rounded-full cursor-pointer transition-all duration-300 shrink-0 ${i === currentQuestionIndex ? 'bg-primary-500 scale-125 shadow-[0_0_15px_rgba(139,92,246,0.6)]' : q.isEvaluated ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : (q.isSubmitted || submittedLocal[i]) ? 'bg-indigo-400 animate-pulse' : 'bg-surface-800'}`}
                            title={`Question ${i + 1}`}
                        />
                    ))}
                </div>
            </div>
            <button
                onClick={handleFinishInterview}
                disabled={isLoading || finishDisabled}
                className="btn-danger flex items-center justify-center gap-3 px-8! py-3! w-full sm:w-auto shrink-0 cursor-pointer text-sm font-bold uppercase tracking-widest"
            >
                {isLoading ? (
                    <span className="w-5 h-5 border-2 border-white/20 border-t-white animate-spin rounded-full" />
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                )}
                {isLoading ? "Finalizing..." : "Finish Session"}
            </button>
        </div>
    );
};

export default InterviewHeader;
