import { motion } from "framer-motion";

export default function SkeletonSessionCard() {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="group glass-card rounded-3xl p-6 flex flex-col items-stretch gap-6 relative"
        >
            <div className="flex items-center gap-5 relative z-10">
                <div className="w-14 h-14 shrink-0 rounded-2xl bg-surface-800/80 animate-pulse shadow-[0_0_15px_rgba(0,0,0,0.5)] border border-white/5"></div>
                <div className="overflow-hidden grow space-y-2">
                    <div className="h-5 bg-surface-700/80 animate-pulse rounded-md w-3/4"></div>
                    <div className="flex items-center gap-2 mt-1">
                        <div className="h-3 w-16 bg-surface-800 animate-pulse rounded-full"></div>
                        <span className="w-1 h-1 rounded-full bg-surface-700"></span>
                        <div className="h-3 w-20 bg-surface-800 animate-pulse rounded-full"></div>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-between mt-2 pt-5 border-t border-white/5 relative z-10">
                <div className="space-y-1">
                    <div className="h-2 w-24 bg-surface-800 animate-pulse rounded-full"></div>
                    <div className="h-8 w-16 bg-surface-700/60 animate-pulse rounded-md mt-1"></div>
                </div>
                <div className="flex flex-col items-end gap-2">
                    <div className="h-4 w-16 bg-surface-800 animate-pulse rounded-lg"></div>
                    <div className="h-3 w-12 bg-surface-800 animate-pulse rounded-full mt-1"></div>
                </div>
            </div>
        </motion.div>
    );
}
