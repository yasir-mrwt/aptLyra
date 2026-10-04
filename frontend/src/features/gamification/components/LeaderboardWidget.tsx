import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "../../../app/store";
import { fetchLeaderboard } from "../gamificationSlice";
import { motion } from "framer-motion";
import { Trophy, Medal } from "lucide-react";

export const LeaderboardWidget = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { leaderboard, isLoading, isError, message } = useSelector(
    (state: RootState) => state.gamification
  );

  useEffect(() => {
    dispatch(fetchLeaderboard(10));
  }, [dispatch]);

  if (isLoading) {
    return (
      <div className="p-6 text-surface-400 bg-surface-800/30 rounded-3xl animate-pulse h-64 border border-white/5 mb-8">
        Loading leaderboard...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 text-rose-400 bg-rose-500/10 rounded-3xl border border-rose-500/20 mb-8">
        Leaderboard Error: {message}
      </div>
    );
  }

  if (!leaderboard || leaderboard.length === 0) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="glass-card p-6 rounded-3xl border-white/5 h-full bg-linear-to-br from-indigo-500/5 to-transparent"
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
          <Trophy className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Top Performers</h2>
          <p className="text-sm text-surface-400">Global Leaderboard</p>
        </div>
      </div>

      <div className="space-y-3">
        {leaderboard.map((user, index) => (
          <div
            key={user.userId || `${user.name}-${index}`}
            className={`flex items-center justify-between p-4 rounded-2xl border ${index === 0
              ? "bg-amber-500/10 border-amber-500/20"
              : index === 1
                ? "bg-slate-300/10 border-slate-300/20"
                : index === 2
                  ? "bg-amber-700/10 border-amber-700/20"
                  : "bg-surface-800/30 border-white/5"
              }`}
          >
            <div className="flex items-center gap-4">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${index === 0
                  ? "bg-amber-500 text-amber-950"
                  : index === 1
                    ? "bg-slate-300 text-slate-900"
                    : index === 2
                      ? "bg-amber-700 text-white"
                      : "bg-surface-700 text-surface-300"
                  }`}
              >
                {index + 1}
              </div>
              <div>
                <p className="font-semibold text-white">{user.name}</p>
                <div className="flex items-center gap-2 text-xs font-medium mt-1">
                  <span className="text-indigo-400">Level {user.level}</span>
                  <span className="w-1 h-1 rounded-full bg-surface-600"></span>
                  <span className="text-surface-400">{user.xp} XP</span>
                </div>
              </div>
            </div>
            {index < 3 && <Medal className={`w-5 h-5 ${index === 0 ? 'text-amber-400' : index === 1 ? 'text-slate-300' : 'text-amber-600'}`} />}
          </div>
        ))}
      </div>
    </motion.div>
  );
};
