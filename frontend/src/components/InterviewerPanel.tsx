import React from "react";
import InterviewerAvatar from "./InterviewerAvatar";
import { INTERVIEWER_PROFILE } from "../constants/interviewer";

/**
 * The interviewer's "seat" — avatar, name plate, live speaking state
 * and voice controls (replay / mute), sitting beside the question card.
 */

interface InterviewerPanelProps {
    speaking: boolean;
    listening?: boolean;
    processing?: boolean;
    preparing?: boolean;
    completed?: boolean;
    error?: string | null;
    usingBrowserVoice?: boolean;
    amplitude: number;
    muted: boolean;
    onToggleMute: () => void;
    onReplay: () => void;
}

const InterviewerPanel: React.FC<InterviewerPanelProps> = ({
    speaking, listening, processing, preparing, completed, error, usingBrowserVoice,
    amplitude,
    muted,
    onToggleMute,
    onReplay,
}) => {
    return (
        <div className="glass-card rounded-[2.5rem] border-white/5 p-6 flex flex-col items-center justify-center gap-4 md:w-60 shrink-0">
            <InterviewerAvatar speaking={speaking} amplitude={amplitude} size={150} />

            <div className="text-center">
                <p className="text-white font-black tracking-tight">{INTERVIEWER_PROFILE.displayName}</p>
                <p className="text-[9px] font-black uppercase tracking-[0.25em] text-surface-500 mt-0.5">
                    AI Interviewer
                </p>
            </div>

            {/* Live status */}
            <div role="status" aria-live="polite" className="min-h-5 flex items-center gap-2 text-center">
                {speaking && !listening && !processing && !completed ? (
                    <>
                        <span className="flex items-end gap-[3px] h-4">
                            {[0, 1, 2, 3].map((i) => (
                                <span
                                    key={i}
                                    className="w-[3px] rounded-full bg-primary-400"
                                    style={{
                                        height: `${4 + Math.max(0.15, amplitude) * (8 + (i % 2) * 6)}px`,
                                        transition: "height 90ms ease",
                                    }}
                                />
                            ))}
                        </span>
                        <span className="text-[9px] font-black uppercase tracking-[0.25em] text-primary-400">
                            Speaking
                        </span>
                    </>
                ) : (
                    <span className="text-[9px] font-black uppercase tracking-[0.25em] text-surface-600">
                        {completed ? "Completed" : processing ? "Processing answer" : listening ? "Listening" : preparing ? "Preparing voice" : error ? "Retry available" : muted ? "Voice Off" : usingBrowserVoice ? "Browser voice" : "Ready"}
                    </span>
                )}
            </div>

            {error && <p role="alert" className="text-xs text-rose-300 text-center break-words">{error}</p>}

            {/* Controls */}
            <div className="flex items-center gap-3">
                <button
                    onClick={onReplay}
                    disabled={muted || listening || processing || preparing || completed}
                    title="Repeat the question"
                    className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-surface-300 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                    </svg>
                </button>
                <button
                    onClick={onToggleMute}
                    title={muted ? "Unmute interviewer" : "Mute interviewer"}
                    className={`w-10 h-10 rounded-full border flex items-center justify-center transition-all cursor-pointer ${muted
                        ? "bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20"
                        : "bg-white/5 border-white/10 text-surface-300 hover:text-white hover:bg-white/10"
                        }`}
                >
                    {muted ? (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                            <line x1="23" y1="9" x2="17" y2="15" />
                            <line x1="17" y1="9" x2="23" y2="15" />
                        </svg>
                    ) : (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                        </svg>
                    )}
                </button>
            </div>
        </div>
    );
};

export default InterviewerPanel;
