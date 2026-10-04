import React from "react";
import { motion } from "framer-motion";
import type { SpeechMetrics } from "../types/session";

interface SpeechAnalyticsPanelProps {
    metrics?: SpeechMetrics;
}

const SpeechAnalyticsPanel: React.FC<SpeechAnalyticsPanelProps> = ({ metrics }) => {
    if (!metrics) return null;

    const getPaceColor = (rating: string) => {
        if (rating === "Good") return "text-emerald-400";
        if (rating === "Fast") return "text-amber-400";
        return "text-indigo-400";
    };

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-4 rounded-2xl border-white/5 border-l-primary-500/30">
                <p className="text-[10px] font-black uppercase tracking-widest text-surface-500">Speaking Pace</p>
                <div className="flex items-end gap-2 mt-2">
                    <span className="text-2xl font-black text-white">{Math.round(metrics.speakingPaceWpm || 0)}</span>
                    <span className="text-xs text-surface-400 pb-1 uppercase tracking-widest font-black">WPM</span>
                </div>
                <p className={`text-[10px] uppercase tracking-widest font-black mt-1 ${getPaceColor(metrics.paceRating || "")}`}>
                    {metrics.paceRating || "N/A"}
                </p>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card p-4 rounded-2xl border-white/5 border-l-rose-500/30">
                <p className="text-[10px] font-black uppercase tracking-widest text-surface-500">Filler Words</p>
                <div className="flex items-end gap-2 mt-2">
                    <span className="text-2xl font-black text-white">{metrics.fillerWordCount || 0}</span>
                    <span className="text-xs text-surface-400 pb-1 uppercase tracking-widest font-black">Words</span>
                </div>
                <p className="text-[10px] uppercase tracking-widest font-black mt-1 text-surface-400">
                    {(metrics.fillerWordCount || 0) > 5 ? "Needs Improvement" : "Excellent"}
                </p>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-card p-4 rounded-2xl border-white/5 border-l-amber-500/30">
                <p className="text-[10px] font-black uppercase tracking-widest text-surface-500">Total Pauses</p>
                <div className="flex items-end gap-2 mt-2">
                    <span className="text-2xl font-black text-white">{metrics.pauseCount || 0}</span>
                    <span className="text-xs text-surface-400 pb-1 uppercase tracking-widest font-black">Pauses</span>
                </div>
                <p className="text-[10px] uppercase tracking-widest font-black mt-1 text-surface-400">
                    {Math.round((metrics.totalPauseDurationMs || 0) / 1000)}s Total
                </p>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass-card p-4 rounded-2xl border-white/5 border-l-emerald-500/30">
                <p className="text-[10px] font-black uppercase tracking-widest text-surface-500">Clarity</p>
                <div className="flex items-end gap-2 mt-2">
                    <span className="text-2xl font-black text-white">{Math.min(100, Math.max(0, metrics.clarityScore || 0))}</span>
                    <span className="text-xs text-surface-400 pb-1 uppercase tracking-widest font-black">/100</span>
                </div>
                <div className="w-full h-1 bg-surface-800 rounded-full mt-2 overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, Math.max(0, metrics.clarityScore || 0))}%` }}></div>
                </div>
            </motion.div>
        </div>
    );
};

export default SpeechAnalyticsPanel;
