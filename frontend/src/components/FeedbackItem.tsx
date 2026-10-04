import React from "react";
import { Ghost } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { FeedbackItemProps } from "../types/components";
import { sanitizeQuestionText, formatIdealAnswer } from "../utils/formatters";
import SpeechAnalyticsPanel from "./SpeechAnalyticsPanel";

const FeedbackItem: React.FC<FeedbackItemProps> = ({ question, index }) => {
    return (
        <div className="glass-card rounded-[2.5rem] overflow-hidden group/item transition-all duration-700 hover:shadow-[0_0_50px_rgba(139,92,246,0.05)] transform-gpu">
            <div className="p-8 sm:p-12 space-y-10 transition-colors">
                {/* Question Header */}
                <div className="flex flex-col lg:flex-row justify-between items-start gap-8">
                    <div className="flex-1 space-y-3">
                        <div className="flex items-center gap-3">
                            <span className="px-3 py-1 rounded-lg bg-primary-500/10 border border-primary-500/20 text-[10px] font-black uppercase tracking-widest text-primary-400">Terminal Q{index + 1}</span>
                            <div className="h-px w-12 bg-white/5"></div>
                        </div>
                        <h4 className="text-xl sm:text-2xl font-black text-white leading-tight font-display">
                            {sanitizeQuestionText(question.questionText)}
                        </h4>
                    </div>

                    <div className="flex gap-2 sm:gap-3 shrink-0 w-full lg:w-auto">
                        <div className="flex-1 lg:flex-none px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl border flex justify-center items-center gap-1.5 sm:gap-3 bg-white/5 border-white/10 group-hover/item:border-primary-500/30 transition-all">
                            <span className="text-[8px] sm:text-[10px] font-black uppercase text-surface-500 tracking-widest">Mastery</span>
                            <span className="text-xs sm:text-sm font-black text-primary-400">{question.technicalScore}%</span>
                        </div>

                        <div className="flex-1 lg:flex-none px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl border flex justify-center items-center gap-1.5 sm:gap-3 bg-white/5 border-white/10 group-hover/item:border-indigo-500/30 transition-all">
                            <span className="text-[8px] sm:text-[10px] font-black uppercase text-surface-500 tracking-widest">Confidence</span>
                            <span className="text-xs sm:text-sm font-black text-indigo-400">{question.confidenceScore}%</span>
                        </div>
                    </div>
                </div>

                {/* User Submission */}
                <div className="space-y-4">
                    <div className="flex items-center gap-3 ml-1">
                        <span className="text-[10px] font-black text-surface-500 uppercase tracking-[0.3em]">Candidacy Submission</span>
                        <div className="h-px grow bg-white/5"></div>
                    </div>

                    <div className="bg-surface-950/50 rounded-4xl border border-white/5 overflow-hidden transition-all group-hover/item:border-white/10">
                        {question.userSubmittedCode && question.userSubmittedCode !== 'undefined' && (
                            <div className="p-6 sm:p-8 border-b border-white/5 last:border-0 relative">
                                <div className="absolute top-4 right-6 text-[9px] font-bold text-surface-500 uppercase tracking-widest opacity-50">Log :: Code</div>
                                <pre className="text-xs sm:text-sm font-mono text-surface-300 overflow-x-auto custom-scrollbar pb-2 leading-relaxed">
                                    {question.userSubmittedCode}
                                </pre>
                            </div>
                        )}

                        {question.userAnswerText && (
                            <div className="p-6 sm:p-8 relative">
                                <div className="absolute top-4 right-6 text-[9px] font-bold text-surface-500 uppercase tracking-widest opacity-50">Log :: Audio Transcript</div>
                                <p className="text-sm sm:text-base text-surface-400 italic leading-relaxed font-medium pt-4 sm:pt-0">
                                    « {question.userAnswerText} »
                                </p>
                            </div>
                        )}

                        {!question.userAnswerText && (!question.userSubmittedCode || question.userSubmittedCode === 'undefined') && (
                            <div className="p-10 text-center text-surface-600 text-xs font-bold uppercase tracking-widest italic opacity-50">
                                <Ghost className="w-10 h-10 mb-4 mx-auto opacity-30" />
                                Null data pointer / No record
                            </div>
                        )}
                    </div>
                </div>

                {/* AI Insights and Ideal Implementation */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 pt-10 border-t border-white/5">
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 ml-1">
                            <div className="w-1.5 h-4 bg-primary-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(139,92,246,0.5)]"></div>
                            <span className="text-[10px] font-black text-surface-500 uppercase tracking-[0.3em]">Neural Analytics</span>
                        </div>
                        <div className="bg-white/5 p-6 sm:p-8 rounded-4xl text-sm sm:text-base italic text-surface-300 border-l-[6px] border-primary-500/50 leading-relaxed shadow-inner">
                            <div className="prose prose-invert max-w-none text-surface-300 prose-p:leading-relaxed prose-code:text-primary-400 prose-code:bg-white/5 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:font-mono">
                                <ReactMarkdown>
                                    {question.aiFeedback || ""}
                                </ReactMarkdown>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center gap-3 ml-1">
                            <div className="w-1.5 h-4 bg-indigo-500 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.5)]"></div>
                            <span className="text-[10px] font-black text-surface-500 uppercase tracking-[0.3em]">Execution Reference</span>
                        </div>
                        <div className="bg-surface-950 p-6 sm:p-8 rounded-4xl text-xs sm:text-[13px] border border-white/5 overflow-x-auto shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] leading-relaxed group-hover/item:border-indigo-500/20 transition-colors">
                            <div className="prose prose-invert max-w-none prose-p:my-2 prose-code:text-indigo-400 prose-code:bg-white/5 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:font-mono prose-ul:my-2 prose-li:my-1 prose-pre:whitespace-pre prose-pre:overflow-x-auto prose-pre:custom-scrollbar prose-pre:bg-white/5 prose-pre:p-4 prose-pre:rounded-xl">
                                <ReactMarkdown>
                                    {formatIdealAnswer(question.idealAnswer)}
                                </ReactMarkdown>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Speech Analytics */}
                {question.speechMetrics && (
                    <div className="pt-10 border-t border-white/5 mt-10">
                        <div className="flex items-center gap-3 ml-1 mb-6">
                            <span className="text-[10px] font-black text-surface-500 uppercase tracking-[0.3em]">Speech Diagnostics</span>
                            <div className="h-px grow bg-white/5"></div>
                        </div>
                        <SpeechAnalyticsPanel metrics={question.speechMetrics} />
                    </div>
                )}
            </div>
        </div>
    );
};

export default FeedbackItem;
