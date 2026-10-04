import { useState } from "react";
import { motion } from "framer-motion";
import { toast } from "react-toastify";
import axios from "axios";
import apiClient from "../../../services/apiClient";
import type { ResumeData, DeepInsights } from "../types";

/**
 * Deep Insights — recruiter-grade intelligence on the resume:
 * executive summary, role alignment, skill depth, top signals, weak areas,
 * inferred competencies, credibility risks (with probe questions) and a full
 * interview-prep plan. JD-aware when a job description was uploaded.
 */

const fadeUp = {
    hidden: { opacity: 0, y: 16 },
    visible: (i: number = 0) => ({
        opacity: 1,
        y: 0,
        transition: { duration: 0.4, delay: i * 0.06 },
    }),
};

const LEVEL_STYLES: Record<string, { chip: string; bar: string }> = {
    advanced: { chip: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", bar: "bg-emerald-500" },
    strong: { chip: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", bar: "bg-emerald-500" },
    moderate: { chip: "bg-amber-500/10 text-amber-400 border-amber-500/20", bar: "bg-amber-500" },
    beginner: { chip: "bg-rose-500/10 text-rose-400 border-rose-500/20", bar: "bg-amber-400" },
};

const SEVERITY_STYLES: Record<string, string> = {
    high: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    low: "bg-surface-700/50 text-surface-400 border-white/10",
};

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white mb-6 flex items-center gap-3">
        <span className="w-1.5 h-4 bg-primary-500 rounded-full"></span>
        {children}
    </h3>
);

const ScoreBar = ({ score }: { score: number }) => (
    <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="h-2 flex-1 bg-white/5 rounded-full overflow-hidden">
            <motion.div
                initial={{ width: 0 }}
                whileInView={{ width: `${Math.min(100, Math.max(0, score))}%` }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className={`h-full rounded-full ${score >= 75 ? "bg-emerald-500" : score >= 55 ? "bg-amber-500" : "bg-rose-400"}`}
            />
        </div>
        <span className="text-xs font-bold text-surface-400 w-9 text-right shrink-0">{score}%</span>
    </div>
);

interface DeepInsightsTabProps {
    resumeData: ResumeData;
    /** Lets the parent merge freshly generated insights into its resume state,
     * so they survive tab switches and page revisits without a refetch. */
    onInsightsGenerated?: (insights: DeepInsights) => void;
}

export const DeepInsightsTab = ({ resumeData, onInsightsGenerated }: DeepInsightsTabProps) => {
    const [generated, setGenerated] = useState<DeepInsights | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);

    const insights: DeepInsights = generated || resumeData?.analysisReport?._v2?.insights || {};
    const hasInsights = insights && Object.keys(insights).length > 0;
    const jdAware = Boolean(resumeData?.jdText);

    const handleGenerate = async () => {
        if (isGenerating || !resumeData?._id) return;
        setIsGenerating(true);
        try {
            const res = await apiClient.post<{ insights: DeepInsights }>(`/resume/${resumeData._id}/insights`);
            setGenerated(res.data.insights || {});
            onInsightsGenerated?.(res.data.insights || {});
            toast.success("Deep insights ready 🔍");
        } catch (error: unknown) {
            const message = axios.isAxiosError(error)
                ? error.response?.data?.error?.message ?? error.response?.data?.message ?? error.message
                : String(error);
            toast.error(message || "Failed to generate insights");
        } finally {
            setIsGenerating(false);
        }
    };

    if (!hasInsights) {
        return (
            <div className="text-center py-24">
                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6 border border-white/5">
                    <span className="text-2xl">🔍</span>
                </div>
                <p className="text-surface-400 font-bold text-sm uppercase tracking-widest mb-2">
                    Deep insights not generated yet
                </p>
                <p className="text-surface-600 text-xs mb-8 max-w-sm mx-auto leading-relaxed">
                    Credibility risks, skill depth, role alignment and a full interview-prep plan
                    {jdAware ? " — targeted at your job description." : "."}
                </p>
                <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="btn-primary inline-flex items-center gap-3 text-xs uppercase tracking-widest font-black disabled:opacity-60 disabled:cursor-wait"
                >
                    {isGenerating ? (
                        <>
                            <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin"></span>
                            Analyzing like a recruiter...
                        </>
                    ) : (
                        <>Generate Deep Insights</>
                    )}
                </button>
            </div>
        );
    }

    const prep = insights.interview_prep || {};

    return (
        <div className="space-y-10">
            {/* ── Executive Summary ── */}
            {insights.executive_summary && (
                <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0}
                    className="glass-card rounded-3xl p-8 border-white/5">
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                        <SectionTitle>Executive Summary</SectionTitle>
                        {jdAware && (
                            <span className="text-[9px] font-black uppercase tracking-[0.2em] bg-primary-500/10 text-primary-400 border border-primary-500/20 px-3 py-1 rounded-full">
                                JD-Targeted Analysis
                            </span>
                        )}
                    </div>
                    <p className="text-surface-300 leading-relaxed text-[15px]">{insights.executive_summary}</p>
                </motion.div>
            )}

            {/* ── Role Alignment ── */}
            {insights.role_alignment && insights.role_alignment.length > 0 && (
                <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
                    className="glass-card rounded-3xl p-8 border-white/5">
                    <SectionTitle>Role Alignment {jdAware ? "(vs. Job Description)" : ""}</SectionTitle>
                    <div className="space-y-4">
                        {insights.role_alignment.map((item, i) => (
                            <div key={i} className="flex items-center gap-4">
                                <span className="text-sm text-surface-300 font-medium w-56 shrink-0 leading-tight">{item.area}</span>
                                <ScoreBar score={item.score} />
                            </div>
                        ))}
                    </div>
                </motion.div>
            )}

            {/* ── Skill Depth ── */}
            {insights.skill_depth && insights.skill_depth.length > 0 && (
                <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
                    className="glass-card rounded-3xl p-8 border-white/5">
                    <SectionTitle>Skill Depth</SectionTitle>
                    <div className="space-y-5">
                        {insights.skill_depth.map((item, i) => {
                            const styles = LEVEL_STYLES[item.level] || LEVEL_STYLES.moderate;
                            return (
                                <div key={i} className="flex items-center gap-4 flex-wrap sm:flex-nowrap">
                                    <span className="text-sm text-surface-300 font-medium w-56 shrink-0 leading-tight">{item.skill}</span>
                                    <span className={`text-[9px] font-black uppercase tracking-[0.15em] border px-3 py-1 rounded-full shrink-0 ${styles.chip}`}>
                                        {item.level}
                                    </span>
                                    <ScoreBar score={item.score} />
                                </div>
                            );
                        })}
                    </div>
                </motion.div>
            )}

            {/* ── Top Signals ── */}
            {insights.top_signals && insights.top_signals.length > 0 && (
                <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
                    className="glass-card rounded-3xl p-8 border-white/5">
                    <SectionTitle>Top Signals</SectionTitle>
                    <div className="grid gap-4 sm:grid-cols-2">
                        {insights.top_signals.map((s, i) => (
                            <div key={i} className="rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.04] p-5">
                                <p className="text-sm font-bold text-emerald-300 leading-snug flex items-start gap-2">
                                    <span className="mt-0.5 shrink-0">✓</span> {s.title}
                                </p>
                                <p className="text-xs text-surface-400 mt-2 leading-relaxed">{s.reason}</p>
                            </div>
                        ))}
                    </div>
                </motion.div>
            )}

            {/* ── Weak Areas + Inferred Competencies ── */}
            <div className="grid gap-10 lg:grid-cols-2">
                {insights.weak_areas && insights.weak_areas.length > 0 && (
                    <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
                        className="glass-card rounded-3xl p-8 border-white/5">
                        <SectionTitle>Weak Areas</SectionTitle>
                        <div className="space-y-4">
                            {insights.weak_areas.map((w, i) => (
                                <div key={i} className="rounded-2xl border border-rose-500/15 bg-rose-500/[0.04] p-5">
                                    <p className="text-sm font-bold text-rose-300 leading-snug flex items-start gap-2">
                                        <span className="mt-0.5 shrink-0">⊗</span> {w.title}
                                    </p>
                                    <p className="text-xs text-surface-400 mt-2 leading-relaxed">{w.detail}</p>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}

                {insights.inferred_competencies && insights.inferred_competencies.length > 0 && (
                    <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
                        className="glass-card rounded-3xl p-8 border-white/5">
                        <SectionTitle>Inferred Competencies</SectionTitle>
                        <div className="space-y-4">
                            {insights.inferred_competencies.map((c, i) => (
                                <div key={i} className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
                                    <div className="flex items-start justify-between gap-3">
                                        <p className="text-sm font-bold text-white leading-snug">{c.title}</p>
                                        <span className={`text-[9px] font-black uppercase tracking-[0.15em] border px-3 py-1 rounded-full shrink-0 ${c.confidence === "high" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"}`}>
                                            {c.confidence}
                                        </span>
                                    </div>
                                    <p className="text-xs text-surface-400 mt-2 leading-relaxed">{c.evidence}</p>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </div>

            {/* ── Credibility Risks ── */}
            {insights.credibility_risks && insights.credibility_risks.length > 0 && (
                <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
                    className="glass-card rounded-3xl p-8 border-white/5">
                    <SectionTitle>Credibility Risks</SectionTitle>
                    <p className="text-xs text-surface-500 -mt-3 mb-6">Claims an interviewer will probe — prepare a concrete answer for each.</p>
                    <div className="space-y-4">
                        {insights.credibility_risks.map((r, i) => (
                            <div key={i} className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
                                <div className="flex items-start justify-between gap-4">
                                    <p className="text-sm font-bold text-white leading-relaxed">{r.claim}</p>
                                    <span className={`text-[9px] font-black uppercase tracking-[0.15em] border px-3 py-1 rounded-full shrink-0 ${SEVERITY_STYLES[r.severity] || SEVERITY_STYLES.medium}`}>
                                        {r.severity}
                                    </span>
                                </div>
                                <p className="text-xs text-surface-400 mt-3 leading-relaxed">{r.risk}</p>
                                <p className="text-xs italic text-primary-400/90 mt-4 border-t border-white/5 pt-3">
                                    <span className="font-bold not-italic text-primary-400">Probe:</span> {r.probe}
                                </p>
                            </div>
                        ))}
                    </div>
                </motion.div>
            )}

            {/* ── Interview Prep ── */}
            {(prep.readiness_note || (prep.priority_areas && prep.priority_areas.length > 0)) && (
                <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
                    className="glass-card rounded-3xl p-8 border-white/5">
                    <SectionTitle>Interview Prep</SectionTitle>

                    {prep.readiness_note && (
                        <div className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.04] p-6 mb-6">
                            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-400 mb-3">Readiness Note</p>
                            <p className="text-sm text-surface-300 leading-relaxed">{prep.readiness_note}</p>
                        </div>
                    )}

                    {prep.priority_areas && prep.priority_areas.length > 0 && (
                        <div className="space-y-4 mb-6">
                            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-surface-500">Priority Areas</p>
                            {prep.priority_areas.map((p, i) => (
                                <div key={i} className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
                                    <div className="flex items-start justify-between gap-4">
                                        <p className="text-sm font-bold text-white leading-snug">{p.topic}</p>
                                        <span className={`text-[9px] font-black uppercase tracking-[0.15em] border px-3 py-1 rounded-full shrink-0 ${SEVERITY_STYLES[p.severity] || SEVERITY_STYLES.medium}`}>
                                            {p.severity}
                                        </span>
                                    </div>
                                    <p className="text-xs text-surface-400 mt-2 leading-relaxed">{p.why}</p>
                                    {p.focus_points && p.focus_points.length > 0 && (
                                        <div className="flex flex-wrap gap-2 mt-4">
                                            {p.focus_points.map((fp, j) => (
                                                <span key={j} className="text-[11px] text-surface-300 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full">
                                                    {fp}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {prep.strategy_tips && prep.strategy_tips.length > 0 && (
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-surface-500 mb-4">Strategy Tips</p>
                            <div className="grid gap-3 sm:grid-cols-2">
                                {prep.strategy_tips.map((tip, i) => (
                                    <div key={i} className="flex items-start gap-3 rounded-2xl border border-white/5 bg-white/[0.02] p-4">
                                        <span className="text-amber-400 shrink-0">💡</span>
                                        <p className="text-xs text-surface-300 leading-relaxed">{tip}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </motion.div>
            )}
        </div>
    );
};
