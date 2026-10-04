import React from "react";
import MicIcon from "./MicIcon";

interface VerbalRecorderProps {
    isRecording: boolean;
    recordingTime: number;
    hasAudio: boolean;
    isQuestionLocked: boolean;
    startRecording: () => void;
    stopRecording: () => void;
    deleteDraftAudio: () => void;
}

const VerbalRecorder: React.FC<VerbalRecorderProps> = ({
    isRecording,
    recordingTime,
    hasAudio,
    isQuestionLocked,
    startRecording,
    stopRecording,
    deleteDraftAudio
}) => {
    return (
        <div className="glass-card p-10 rounded-4xl flex flex-col items-center justify-center min-h-120 border-white/5 relative overflow-hidden group">
            {/* Visual focus element */}
            <div className={`absolute inset-0 bg-primary-500/5 transition-opacity duration-1000 ${isRecording ? 'opacity-100' : 'opacity-0'}`}></div>
            
            <h3 className="text-[10px] font-black text-surface-500 uppercase tracking-[0.3em] mb-12 relative z-10 flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full ${isRecording ? 'bg-rose-500 animate-pulse shadow-[0_0_10px_rgba(244,63,94,0.5)]' : 'bg-primary-500'}`}></span>
                Verbal Frequency Input
            </h3>
            
            {!isRecording && !hasAudio ? (
                <button
                    onClick={startRecording}
                    disabled={isQuestionLocked}
                    className="w-32 h-32 bg-primary-500 rounded-full flex items-center justify-center text-white shadow-[0_0_30px_rgba(139,92,246,0.2)] hover:scale-105 active:scale-95 transition-all disabled:opacity-20 cursor-pointer relative z-10 group/btn"
                >
                    <div className="absolute inset-0 rounded-full border-4 border-white/20 scale-110 group-hover/btn:scale-125 transition-all duration-500"></div>
                    <MicIcon />
                </button>
            ) : isRecording ? (
                <div className="flex flex-col items-center gap-8 relative z-10">
                    <div className="relative">
                        <div className="absolute inset-0 bg-rose-500/20 rounded-full blur-2xl animate-pulse"></div>
                        <button 
                            onClick={stopRecording}
                            className="w-32 h-32 bg-rose-500 rounded-full flex items-center justify-center text-white relative shadow-2xl active:scale-95 transition-all"
                        >
                            <div className="w-8 h-8 bg-white rounded-md shadow-inner"></div>
                        </button>
                    </div>
                    <div className="text-center space-y-2">
                        <span className="text-4xl font-black text-rose-500 font-mono tracking-tighter block shadow-sm">
                            {Math.floor(recordingTime / 60)}:{String(recordingTime % 60).padStart(2, '0')}
                        </span>
                        <p className="text-[10px] font-black uppercase tracking-widest text-surface-500">System Capturing...</p>
                    </div>
                </div>
            ) : (
                <div className="text-center relative z-10 space-y-8">
                    <div className="w-32 h-32 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto shadow-inner">
                        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                    </div>
                    <div className="space-y-4">
                        <h4 className="text-emerald-400 font-black uppercase tracking-[0.2em] text-sm">Sequence Recorded</h4>
                        {!isQuestionLocked && (
                            <button
                                onClick={deleteDraftAudio}
                                className="group flex items-center gap-2 mx-auto text-[10px] font-black text-surface-500 uppercase tracking-widest hover:text-rose-400 transition-colors cursor-pointer"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                                Purge & Recapture
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default VerbalRecorder;
