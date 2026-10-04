import { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { fetchGamificationProfile, fetchLeaderboard } from "../gamificationSlice";
import { motion } from "framer-motion";
import type { AppDispatch, RootState } from "../../../app/store";
import { BadgeIcon } from "./BadgeIcon";

const LEVEL_THRESHOLDS = [
  { level: 1, xpRequired: 0, title: "Novice" },
  { level: 2, xpRequired: 200, title: "Apprentice" },
  { level: 3, xpRequired: 500, title: "Practitioner" },
  { level: 4, xpRequired: 1000, title: "Intermediate" },
  { level: 5, xpRequired: 2000, title: "Advanced" },
  { level: 6, xpRequired: 3500, title: "Expert" },
  { level: 7, xpRequired: 5000, title: "Master" },
  { level: 8, xpRequired: 7500, title: "Grandmaster" },
  { level: 9, xpRequired: 10000, title: "Legend" },
  { level: 10, xpRequired: 15000, title: "Titan" },
];

export const GamificationWidget = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { profile, leaderboard, isLoading, isError, message } = useSelector((state: RootState) => state.gamification);
  const { user } = useSelector((state: RootState) => state.auth);

  useEffect(() => {
    dispatch(fetchGamificationProfile());
    dispatch(fetchLeaderboard(10));
  }, [dispatch]);

  if (isLoading) {
    return <div className="animate-pulse h-32 bg-white/5 rounded-3xl w-full"></div>;
  }

  if (isError) {
    return <div className="p-6 text-rose-400 bg-rose-500/10 rounded-3xl border border-rose-500/20 mb-8">Gamification Error: {message}</div>;
  }

  if (!profile) return null;

  // Calculate XP boundaries
  const currentThreshold = LEVEL_THRESHOLDS.find(t => t.level === profile.level) || LEVEL_THRESHOLDS[0];
  const nextThreshold = LEVEL_THRESHOLDS.find(t => t.level === profile.level + 1);
  const currentLevelXp = currentThreshold.xpRequired;
  const nextLevelXp = nextThreshold ? nextThreshold.xpRequired : null;

  const calculateXpProgress = () => {
    if (!nextLevelXp) return 100;
    const progress = ((profile.xp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100;
    return Math.min(Math.max(progress, 0), 100);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
      {/* 1. Professional Development */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card rounded-3xl p-6 flex flex-col justify-between">
        <h3 className="text-white font-bold text-lg mb-4 leading-tight">Professional<br />Development</h3>
        <div className="bg-surface-900/40 p-5 rounded-2xl border border-white/5">
          <div className="flex justify-between items-end mb-4">
            <div>
              <div className="text-surface-400 text-[10px] uppercase tracking-wider mb-1">Current Tier</div>
              <div className="text-[#a78bfa] text-sm font-bold">{profile.title}</div>
            </div>
            <div className="text-right">
              <div className="text-white font-bold text-xl">Level {profile.level}</div>
            </div>
          </div>
          
          <div className="w-full bg-white/[0.05] rounded-full h-3 overflow-hidden border border-white/5 mb-3 shadow-inner">
            <div
              className="bg-linear-to-r from-[#7c3aed] to-[#a78bfa] h-full rounded-full transition-all duration-1000 ease-out relative"
              style={{ width: `${calculateXpProgress()}%` }}
            >
              <div className="absolute inset-0 bg-white/20 w-full h-full" style={{ animation: 'shimmer 2s infinite' }}></div>
            </div>
          </div>
          
          <div className="flex justify-between items-center text-sm">
            <span className="text-surface-500 text-[10px] font-medium">Progress to next level</span>
            <span className="text-[#a1a1aa] text-[11px] font-bold tracking-wide">{profile.xp} / {nextLevelXp || "MAX"} XP</span>
          </div>
        </div>
      </motion.div>

      {/* 2. Consistency */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-card rounded-3xl p-6 flex flex-col">
        <h3 className="text-white font-bold text-lg mb-4">Consistency</h3>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 flex-1">
          <div className="flex-1">
            <div className="flex justify-between text-[10px] text-surface-400 mb-2 px-1 w-full md:max-w-[260px]">
              <span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span>
            </div>
            <div className="grid grid-cols-7 gap-2 w-full md:max-w-[260px]">
              {Array.from({ length: 21 }).map((_, i) => {
                const daysAgo = 20 - i;
                const isActive = daysAgo < profile.currentStreak;
                const isHighActivity = isActive && i % 2 === 0;
                return (
                  <div key={i} className={`w-full aspect-square rounded-full flex items-center justify-center ${isActive ? 'bg-[#a78bfa]/20' : 'bg-white/[0.05]'}`}>
                    {isActive && <div className={`w-2 h-2 rounded-full ${isHighActivity ? 'bg-[#a78bfa]' : 'bg-[#a78bfa]/60'}`}></div>}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-4 lg:flex-col lg:items-start lg:justify-center bg-surface-900/40 p-4 rounded-2xl border border-white/5 lg:min-w-[140px] h-full">
            <div className="w-10 h-10 rounded-xl bg-[#a78bfa]/10 flex items-center justify-center text-[#a78bfa] shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <div className="text-2xl font-bold text-[#a78bfa] tracking-tight">{profile.currentStreak} Days</div>
              <div className="text-[9px] text-surface-400 uppercase tracking-widest mt-1">Active Streak</div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* 3. Skills Verified */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card rounded-3xl p-6 flex flex-col">
        <div className="flex justify-between items-start mb-6">
          <h3 className="text-white font-bold text-lg">Skills Verified</h3>
          <span className="text-[#a78bfa] text-xs font-bold">{profile?.badges?.length || 0} Verified</span>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-4 justify-center items-start px-1 pb-2">
          {profile?.badges && profile.badges.length > 0 ? profile.badges.slice(0, 8).map((badge, idx) => (
            <div key={idx} className="flex flex-col items-center min-w-[55px] max-w-[65px]">
              <BadgeIcon badgeId={badge.badgeId} className="w-12 h-12 mb-2 shrink-0" />
              <span 
                className="text-[9px] text-surface-400 whitespace-nowrap overflow-hidden text-ellipsis w-full text-center"
                title={badge.badgeId.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
              >
                {badge.badgeId.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
              </span>
            </div>
          )) : (
            <div className="w-full flex flex-col items-center justify-center text-center py-8">
              <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <circle cx="12" cy="8" r="6" />
                  <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
                </svg>
              </div>
              <p className="text-surface-300 text-sm font-bold">No skills verified yet</p>
              <p className="text-surface-500 text-[11px] font-medium mt-1 max-w-57.5 leading-relaxed">
                Complete interview sessions to earn verified skill badges here.
              </p>
            </div>
          )}
        </div>
      </motion.div>

      {/* 4. Global Rank */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="glass-card rounded-3xl p-6 flex flex-col">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-[#a78bfa]/20 flex items-center justify-center text-[#a78bfa] shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-white font-bold text-lg whitespace-nowrap">Global Rank</h3>
            <p className="text-surface-400 text-xs truncate">Your Rank: {profile?.leaderboardOptIn ? leaderboard?.find(l => l.userId ? (l.userId === user?._id || l.userId === user?.id) : (l.name === user?.name))?.rank || '-' : 'Opted Out'}</p>
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-2 overflow-y-auto max-h-[140px] pr-2 custom-scrollbar">
          {leaderboard?.slice(0, 10).map((entry, idx) => {
            const isCurrentUser = entry.userId ? (entry.userId === user?._id || entry.userId === user?.id) : (entry.name === user?.name);
            return (
              <div key={idx} className={`p-2 flex items-center gap-3 rounded-xl ${isCurrentUser ? 'bg-[#a78bfa]/10 border border-[#a78bfa]/20' : ''}`}>
                <span className={`${isCurrentUser ? 'text-[#a78bfa]' : 'text-surface-500'} font-bold text-xs w-4 text-center shrink-0`}>{idx + 1}.</span>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isCurrentUser ? 'bg-[#a78bfa] text-black' : 'bg-surface-700 text-surface-400'}`}>
                  {isCurrentUser ? (idx + 1) : <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`${isCurrentUser ? 'text-white' : 'text-surface-300'} text-xs font-bold truncate`}>{isCurrentUser ? "You" : entry.name}</div>
                  <div className={`text-[9px] truncate ${isCurrentUser ? 'text-[#a78bfa]' : 'text-surface-500'}`}>Level {entry.level} • {entry.xp} XP</div>
                </div>
                {isCurrentUser && (
                  <svg className="w-4 h-4 text-[#f59e0b] shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16h2a1 1 0 110 2H7a1 1 0 110-2h2V6.477L6.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L9 4.323V3a1 1 0 011-1zm-5 8.274l-.818 2.552c.25.112.526.174.818.174.292 0 .569-.062.818-.174L5 10.274zm10 0l-.818 2.552c.25.112.526.174.818.174.292 0 .569-.062.818-.174L15 10.274z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
};

