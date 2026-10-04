/* eslint-disable @typescript-eslint/no-unused-vars */
import { motion } from "framer-motion";
import { AlertCircle, Star } from "lucide-react";
import type { ResumeData } from "../types";
import ReactMarkdown, { type Components } from "react-markdown";

interface FeedbackTipsTabProps {
  resumeData?: ResumeData;
  issues?: string[];
  strengths?: string[];
  streamingText?: string;
  isStreaming?: boolean;
}

export const FeedbackTipsTab = ({ issues = [], strengths = [], streamingText = "", isStreaming = false }: FeedbackTipsTabProps) => {
  const hasLegacyData = issues.length > 0 || strengths.length > 0;
  const showStreamingView = isStreaming || (streamingText && !hasLegacyData);

  let issuesText = "";
  let strengthsText = "";
  let parts: string[] = [];

  if (showStreamingView) {
    parts = streamingText.split(/##?\s*(?:🌟\s*)?Strengths/i);
    issuesText = parts[0].replace(/##?\s*(?:🚨\s*)?Issues\s*(?:Found)?/iu, "").replace(/[🚨🌟💡]/gu, "").trim();
    if (parts.length > 1) {
      strengthsText = parts[1].replace(/[🚨🌟💡]/gu, "").trim();
    }
  }

  const mdComponents: Components = {
    h1: ({ node: _, ...props }) => <h1 className="text-2xl font-black text-white mt-8 mb-4" {...props} />,
    h2: ({ node: _, ...props }) => <h2 className="text-xl font-bold text-white mt-8 mb-4" {...props} />,
    h3: ({ node: _, ...props }) => <h3 className="text-lg font-bold text-white mt-6 mb-3" {...props} />,
    p: ({ node: _, ...props }) => <p className="text-[15px] text-surface-300 leading-relaxed mb-4" {...props} />,
    ul: ({ node: _, ...props }) => <ul className="space-y-4 mb-8 mt-4" {...props} />,
    li: ({ node: _, className, children, ...props }) => (
      <li className="flex items-start gap-3" {...props}>
        <div className="w-1.5 h-1.5 rounded-full bg-primary-400 mt-2 shrink-0" />
        <div className="text-[15px] text-surface-300 leading-relaxed">
          {children}
        </div>
      </li>
    ),
    strong: ({ node: _, ...props }) => <strong className="font-bold text-white" {...props} />,
  };

  return (
    <motion.div
      key="feedback"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-10"
    >
      {showStreamingView ? (
        <div className="space-y-8">
          <section className="bg-surface-800/40 border border-rose-500/30 rounded-3xl p-6 sm:p-10 shadow-2xl shadow-black/40 backdrop-blur-md relative overflow-hidden">
            <div className="absolute inset-0 bg-linear-to-b from-rose-500/5 to-transparent pointer-events-none" />
            <div className="flex items-center gap-4 mb-6 sm:mb-8 relative z-10">
              <div className="shrink-0 w-10 h-10 rounded-2xl border border-rose-500/50 bg-rose-500/20 flex items-center justify-center shadow-inner shadow-black/20">
                <AlertCircle className="w-5 h-5 text-rose-400" />
              </div>
              <h3 className="text-2xl font-black text-white flex items-center gap-3 tracking-tight">
                Issues Found
                {isStreaming && !strengthsText && <span className="text-[10px] font-black px-2 py-1 rounded-lg bg-rose-500/20 text-rose-400 uppercase tracking-widest ml-2 animate-pulse border border-rose-500/30 shadow-[0_0_10px_rgba(244,63,94,0.2)]">Live</span>}
              </h3>
            </div>
            <div className="max-w-none relative z-10">
              <ReactMarkdown components={mdComponents}>{issuesText}</ReactMarkdown>
              {isStreaming && !strengthsText && (
                <span className="inline-block w-2 h-4 bg-rose-400 ml-1 animate-pulse align-middle" />
              )}
            </div>
          </section>

          {(strengthsText || (isStreaming && parts?.length > 1)) && (
            <section className="bg-surface-800/40 border border-primary-500/30 rounded-3xl p-6 sm:p-10 shadow-2xl shadow-black/40 backdrop-blur-md relative overflow-hidden">
              <div className="absolute inset-0 bg-linear-to-b from-primary-500/5 to-transparent pointer-events-none" />
              <div className="flex items-center gap-4 mb-6 sm:mb-8 relative z-10">
                <div className="shrink-0 w-10 h-10 rounded-2xl border border-primary-500/50 bg-primary-500/20 flex items-center justify-center shadow-inner shadow-black/20">
                  <Star className="w-5 h-5 text-primary-400" />
                </div>
                <h3 className="text-2xl font-black text-white flex items-center gap-3 tracking-tight">
                  Strengths
                  {isStreaming && strengthsText && <span className="text-[10px] font-black px-2 py-1 rounded-lg bg-primary-500/20 text-primary-400 uppercase tracking-widest ml-2 animate-pulse border border-primary-500/30 shadow-[0_0_10px_rgba(167,139,250,0.2)]">Live</span>}
                </h3>
              </div>
              <div className="max-w-none relative z-10">
                <ReactMarkdown components={mdComponents}>{strengthsText}</ReactMarkdown>
                {isStreaming && strengthsText && (
                  <span className="inline-block w-2 h-4 bg-primary-400 ml-1 animate-pulse align-middle" />
                )}
              </div>
            </section>
          )}
        </div>
      ) : hasLegacyData ? (
        <>
          {/* Issues Section */}
          {issues.length > 0 && (
            <section className="bg-surface-800/40 border border-rose-500/30 rounded-3xl p-6 sm:p-10 shadow-2xl shadow-black/40 backdrop-blur-md relative overflow-hidden">
              <div className="absolute inset-0 bg-linear-to-b from-rose-500/5 to-transparent pointer-events-none" />
              <div className="flex items-center gap-4 mb-8 relative z-10">
                <div className="w-1.5 h-8 bg-rose-500 rounded-full shadow-[0_0_10px_rgba(244,63,94,0.5)]" />
                <h3 className="text-xl font-black text-white tracking-tight">Issues Found</h3>
                <span className="px-3 py-1 rounded-lg bg-rose-500/20 text-rose-400 text-[10px] font-black border border-rose-500/30 uppercase tracking-widest shadow-sm shadow-rose-500/10">
                  {issues.length}
                </span>
              </div>
              <div className="space-y-4 relative z-10">
                {issues.map((issue: string, idx: number) => (
                  <div
                    key={idx}
                    className="flex items-start gap-5 bg-surface-900/60 border border-rose-500/20 rounded-2xl p-5 shadow-inner shadow-black/20"
                  >
                    <div className="shrink-0 w-10 h-10 rounded-xl border border-rose-500/40 bg-rose-500/10 flex items-center justify-center shadow-inner shadow-rose-500/5 mt-0.5">
                      <AlertCircle className="w-5 h-5 text-rose-400" />
                    </div>
                    <p className="text-[14.5px] text-surface-200 leading-relaxed font-medium">{issue}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Strengths Section */}
          {strengths.length > 0 && (
            <section className="bg-surface-800/40 border border-primary-500/30 rounded-3xl p-6 sm:p-10 shadow-2xl shadow-black/40 backdrop-blur-md relative overflow-hidden mt-8">
              <div className="absolute inset-0 bg-linear-to-b from-primary-500/5 to-transparent pointer-events-none" />
              <div className="flex items-center gap-4 mb-8 relative z-10">
                <div className="w-1.5 h-8 bg-primary-400 rounded-full shadow-[0_0_10px_rgba(167,139,250,0.5)]" />
                <h3 className="text-xl font-black text-white tracking-tight">Strengths</h3>
                <span className="px-3 py-1 rounded-lg bg-primary-400/20 text-primary-400 text-[10px] font-black border border-primary-400/30 uppercase tracking-widest shadow-sm shadow-primary-400/10">
                  {strengths.length}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10">
                {strengths.map((strength: string, idx: number) => (
                  <div
                    key={idx}
                    className="flex items-start gap-5 bg-surface-900/60 border border-primary-400/20 rounded-2xl p-5 shadow-inner shadow-black/20"
                  >
                    <div className="shrink-0 w-10 h-10 rounded-xl border border-primary-400/40 bg-primary-400/10 flex items-center justify-center shadow-inner shadow-primary-400/5 mt-0.5">
                      <span className="text-primary-400 font-black text-sm">{idx + 1}</span>
                    </div>
                    <p className="text-[14.5px] text-surface-200 leading-relaxed font-medium">{strength}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        <div className="flex items-center justify-center p-12 text-surface-500 text-sm">
          No feedback available yet...
        </div>
      )}
    </motion.div>
  );
};
