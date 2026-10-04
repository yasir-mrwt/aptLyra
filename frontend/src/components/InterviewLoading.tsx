import React from "react";

interface InterviewLoadingProps {
    sessionMessage?: string;
}

const InterviewLoading: React.FC<InterviewLoadingProps> = ({ sessionMessage }) => {
    return (
        <div className="flex flex-col items-center justify-center py-40 gap-6">
            <div className="animate-bounce h-12 w-12 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-xl">
                <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" fill="currentColor"></path>
                </svg>
            </div>
            <div className="text-center">
                <p className="text-slate-800 font-black text-xl italic tracking-tight">Preparing your interview questions...</p>
                {sessionMessage && (
                    <div className="mt-4 px-4 py-2 bg-blue-50 border border-blue-100 rounded-2xl text-blue-600 text-xs font-mono animate-pulse inline-block">
                        {sessionMessage}...
                    </div>
                )}
            </div>
        </div>
    );
};

export default InterviewLoading;
