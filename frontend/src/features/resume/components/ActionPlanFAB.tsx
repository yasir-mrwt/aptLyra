import { useState, useRef, useEffect } from "react";
import { Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ActionPlanFABProps {
  issues: string[];
}

export const ActionPlanFAB = ({ issues }: ActionPlanFABProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!issues || issues.length === 0) return null;

  const topIssues = issues.slice(0, 3);

  return (
    <div className="fixed bottom-8 right-8 z-50 flex flex-col items-end" ref={popoverRef}>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="mb-4 w-80 bg-surface-800 border border-primary-500/30 shadow-2xl shadow-primary-500/10 rounded-2xl overflow-hidden origin-bottom-right"
          >
            <div className="bg-primary-500/10 px-4 py-3 border-b border-primary-500/20">
              <h4 className="text-sm font-black text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary-400" /> Top Priority Fixes
              </h4>
            </div>
            <div className="p-4 space-y-3">
              {topIssues.map((issue, idx) => (
                <div key={idx} className="flex gap-3 items-start">
                  <div className="w-5 h-5 rounded-full bg-primary-500/20 flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold text-primary-400">
                    {idx + 1}
                  </div>
                  <p className="text-xs text-surface-200 leading-relaxed font-medium">
                    {issue}
                  </p>
                </div>
              ))}
              {issues.length > 3 && (
                <div className="pt-2 border-t border-white/5 text-center">
                  <span className="text-[10px] text-surface-500 font-bold uppercase tracking-widest">
                    + {issues.length - 3} more issues in Feedback tab
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setIsOpen(!isOpen)}
        className="group relative flex items-center justify-center w-14 h-14 bg-linear-to-tr from-primary-400 to-indigo-500 rounded-full shadow-xl shadow-primary-500/20 hover:scale-105 active:scale-95 transition-all cursor-pointer"
      >
        {/* Pulse effect */}
        {!isOpen && (
          <span className="absolute inset-0 rounded-full border-2 border-primary-400 animate-ping opacity-20" />
        )}
        
        {isOpen ? (
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        )}
        
        {/* Tooltip */}
        {!isOpen && (
          <div className="absolute right-full mr-4 bg-surface-800 text-white text-xs font-bold px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap border border-white/5">
            View Action Plan
          </div>
        )}
      </button>
    </div>
  );
};
