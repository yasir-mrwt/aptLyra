import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import SpeechAnalyticsPanel from "./SpeechAnalyticsPanel";
import type { SpeechMetrics } from "../types/session";

interface AIFeedbackSectionProps {
    isEvaluated: boolean;
    feedback: string;
    score: number;
    speechMetrics?: SpeechMetrics;
}

const AIFeedbackSection: React.FC<AIFeedbackSectionProps> = ({ isEvaluated, feedback, score, speechMetrics }) => {
    const [activeTab, setActiveTab] = useState<'feedback' | 'speech'>('feedback');

    if (!isEvaluated) return null;

    return (
        <div className="mt-6 glass-card border border-white/10 p-6 rounded-[2.5rem] relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                <svg className="w-32 h-32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.5">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    <path d="M2 12h20" />
                </svg>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 relative z-10">
                <div className="flex gap-2">
                    <button
                        onClick={() => setActiveTab('feedback')}
                        className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors ${activeTab === 'feedback' ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30' : 'text-surface-500 hover:text-white'}`}
                    >
                        AI Feedback
                    </button>
                    {speechMetrics && (
                        <button
                            onClick={() => setActiveTab('speech')}
                            className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors ${activeTab === 'speech' ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30' : 'text-surface-500 hover:text-white'}`}
                        >
                            Speech Analysis
                        </button>
                    )}
                </div>

                <div className="px-4 py-1.5 rounded-full bg-white/5 border border-white/10 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"></span>
                    <span className="text-[10px] font-black uppercase tracking-widest text-surface-300">
                        Score: <span className="text-white">{score}</span>/100
                    </span>
                </div>
            </div>

            <AnimatePresence mode="wait">
                {activeTab === 'feedback' ? (
                    <motion.div
                        key="feedback"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="relative z-10"
                    >
                        <p className="text-surface-300 text-sm leading-relaxed whitespace-pre-wrap font-medium">{feedback}</p>
                    </motion.div>
                ) : (
                    <motion.div
                        key="speech"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="relative z-10"
                    >
                        <SpeechAnalyticsPanel metrics={speechMetrics} />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default AIFeedbackSection;
