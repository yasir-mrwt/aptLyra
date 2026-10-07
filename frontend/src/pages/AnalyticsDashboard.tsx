import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "../app/store";
import { getAnalytics } from "../features/analytics/analyticsSlice";
import { ResumeAnalysisHistory } from "../features/resume/components/ResumeAnalysisHistory";
import { ACHIEVEMENTS } from "../config/achievements";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from "chart.js";
import type { ChartOptions } from "chart.js";
import { Line } from "react-chartjs-2";

interface ProgressItem {
  date: string;
  technicalScore: number;
  confidenceScore: number;
}

interface RoleItem {
  _id: string;
  avgScore: number;
}

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const calculateXpProgress = (xp: number, currentLevelXp: number, nextLevelXp: number | null) => {
  if (nextLevelXp === null || nextLevelXp <= currentLevelXp) return 100;
  return Math.max(0, Math.min(100, ((xp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100));
};

const AnalyticsDashboard: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { data, isLoading, isError, message } = useSelector((state: RootState) => state.analytics);

  const [hiddenDatasets, setHiddenDatasets] = useState<Record<number, boolean>>({
    0: false,
    1: false,
  });

  const toggleDataset = (index: number) => {
    setHiddenDatasets(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  useEffect(() => {
    dispatch(getAnalytics());
  }, [dispatch]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[70vh] w-full">
        <div className="w-16 h-16 border-4 border-surface-700 border-t-primary-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-10 bg-surface-800/40 p-8 rounded-3xl border border-rose-500/30 shadow-2xl backdrop-blur-md max-w-2xl mx-auto mt-20">
        <div className="w-16 h-16 rounded-full bg-rose-500/10 flex items-center justify-center mx-auto mb-4 border border-rose-500/20">
          <svg className="w-8 h-8 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <p className="text-rose-400 font-bold text-lg">Failed to load analytics</p>
        <p className="text-surface-400 text-sm mt-2">{message}</p>
      </div>
    );
  }

  if (!data) return null;

  const { stats, progress, byRole, speech, gamification } = data;

  // Progress Over Time Chart
  const technicalScores = progress?.map((p: ProgressItem) => p.technicalScore) || [];
  const confidenceScores = progress?.map((p: ProgressItem) => p.confidenceScore) || [];
  const progressLabels = progress?.map((p: ProgressItem) => {
    const parts = String(p.date).split('-');
    return parts.length === 3 ? `${parts[1]}/${parts[2]}` : String(p.date);
  }) || [];

  const lineChartData = {
    labels: progressLabels,
    datasets: [
      {
        label: "Technical Score",
        data: technicalScores,
        borderColor: "rgba(167, 139, 250, 1)",
        backgroundColor: "rgba(167, 139, 250, 0.15)",
        fill: true,
        tension: 0.4,
        hidden: hiddenDatasets[0],
      },
      {
        label: "Confidence Score",
        data: confidenceScores,
        borderColor: "rgba(99, 102, 241, 1)",
        backgroundColor: "rgba(99, 102, 241, 0.15)",
        fill: true,
        tension: 0.4,
        hidden: hiddenDatasets[1],
      },
    ]
  };

  const lineChartOptions: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        enabled: true,
        backgroundColor: "rgba(15, 23, 42, 0.9)",
        titleColor: "#f8fafc",
        bodyColor: "#cbd5e1",
        borderColor: "rgba(51, 65, 85, 0.5)",
        borderWidth: 1,
        padding: 12,
        boxPadding: 4,
        usePointStyle: true,
      }
    },
    scales: {
      y: {
        min: 0,
        max: 100,
        grid: { color: "rgba(255,255,255,0.05)" },
        ticks: { color: "#94A3B8", font: { family: "'Inter', sans-serif", weight: 'bold' } }
      },
      x: {
        grid: { color: "rgba(255,255,255,0.05)" },
        ticks: {
          color: "#94A3B8",
          font: { size: 10, family: "'Inter', sans-serif", weight: 'bold' },
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 8
        }
      }
    }
  };

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8">
        <div>
          <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-3 font-display">Performance Insights</h1>
          <p className="text-surface-300 font-medium max-w-2xl text-[15px]">
            Executive-level analysis of your interview performance, skill evolution, and readiness metrics.
          </p>
        </div>
      </div>

      <section className="glass-card p-6 rounded-2xl"><h2>Reviewed rubric evaluation</h2><p>{data.evaluation?.reviewedMean == null ? "Insufficient reviewed coverage" : `Reviewed mean: ${data.evaluation.reviewedMean}/100`} · {data.evaluation?.reviewedScoredSessions || 0} eligible sessions · {data.evaluation?.provisional || 0} provisional · {data.evaluation?.abstained || 0} abstained</p><p>Score trends below use historical legacy evaluations only. Delivery feedback is separate from evaluator confidence.</p></section>
      {/* Top 3 Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Professional Development */}
        <div className="glass-card rounded-3xl p-8 flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute inset-0 bg-linear-to-br from-primary-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
          <div className="flex justify-between items-start mb-8 relative z-10">
            <h3 className="text-[10px] font-black tracking-widest text-surface-400 uppercase">Professional Development</h3>
            <div className="w-8 h-8 rounded-full bg-primary-500/10 flex items-center justify-center border border-primary-500/20">
              <svg className="w-4 h-4 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
          </div>
          <div className="mb-10 relative z-10">
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-black text-white font-display">Lvl. {gamification?.currentLevel || 0}</span>
              <span className="text-surface-400 font-bold text-sm">{gamification?.currentTitle || 'Beginner'}</span>
            </div>
          </div>
          <div className="relative z-10">
            <div className="flex justify-between text-[10px] font-black text-surface-400 mb-3 uppercase tracking-widest">
              <span>Current Progress</span>
              <span className="text-primary-400">{gamification?.xp || 0} / {gamification?.nextLevelXp || 'MAX'} XP</span>
            </div>
            <div className="w-full bg-surface-900/60 rounded-full h-2 overflow-hidden shadow-inner shadow-black/40">
              <div
                className="bg-primary-500 h-full rounded-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(167,139,250,0.5)]"
                style={{ width: `${calculateXpProgress(gamification?.xp || 0, gamification?.currentLevelXp || 0, gamification?.nextLevelXp || null)}%` }}
              ></div>
            </div>
          </div>
        </div>

        <div className="glass-card rounded-3xl p-8 flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute inset-0 bg-linear-to-br from-indigo-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
          <div className="flex justify-between items-start mb-8 relative z-10">
            <h3 className="text-[10px] font-black tracking-widest text-surface-400 uppercase">Total Sessions</h3>
            <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
              <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="mb-6 relative z-10">
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-black text-white font-display">{stats?.totalSessions || 0}</span>
              <span className="text-surface-400 font-bold text-sm">Completed</span>
            </div>
          </div>
          <div className="flex items-end justify-between gap-1.5 h-16 mt-auto relative z-10">
            {Array.from({ length: 14 }).map((_, i) => {
              const scoreIdx = technicalScores.length - 14 + i;
              const score = scoreIdx >= 0 ? technicalScores[scoreIdx] : 0;
              return (
                <div
                  key={i}
                  className="flex-1 bg-surface-900/60 rounded-sm relative overflow-hidden group-hover:bg-surface-800/80 transition-colors shadow-inner shadow-black/40"
                  style={{ height: '100%' }}
                >
                  <div
                    className="absolute bottom-0 w-full bg-linear-to-t from-indigo-500/40 to-indigo-400 rounded-sm transition-all duration-500 ease-out shadow-[0_0_10px_rgba(129,140,248,0.3)]"
                    style={{ height: score > 0 ? `${score}%` : '0%' }}
                  ></div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Performance Consistency */}
        <div className="glass-card rounded-3xl p-8 flex flex-col justify-between relative overflow-hidden group md:col-span-2 lg:col-span-1">
          <div className="absolute inset-0 bg-linear-to-br from-violet-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
          <div className="flex justify-between items-start mb-8 relative z-10">
            <h3 className="text-[10px] font-black tracking-widest text-surface-400 uppercase">Current Streak</h3>
            <div className="flex items-center gap-1.5 text-violet-400 bg-violet-500/10 border border-violet-500/20 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-[0_0_10px_rgba(139,92,246,0.1)]">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
              </svg>
              Active
            </div>
          </div>
          <div className="mt-auto relative z-10">
            <div className="flex items-baseline gap-2 mb-6">
              <span className="text-5xl font-black text-white font-display">{gamification?.streakDays || 0}</span>
              <span className="text-surface-400 font-bold text-sm">Days</span>
            </div>
            <div className="flex justify-between text-[10px] font-black text-surface-400 uppercase tracking-widest bg-surface-900/40 p-4 rounded-2xl border border-surface-600/20">
              <span>Overall Average</span>
              <span className="text-violet-400">{Math.round(stats?.averageOverallScore || 0)}/100</span>
            </div>
          </div>
        </div>
      </div>

      {/* Middle Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Skill Acquisition Velocity */}
        <div className="glass-card rounded-3xl p-8 flex flex-col relative overflow-hidden">
          <div className="flex justify-between items-center mb-8 relative z-10">
            <h3 className="text-[10px] font-black tracking-widest text-surface-400 uppercase">Progress Over Time</h3>
            <div className="flex gap-4 text-[10px] font-black uppercase tracking-widest">
              <div
                className={`flex items-center gap-2 cursor-pointer transition-opacity select-none ${hiddenDatasets[0] ? 'opacity-50 text-surface-500' : 'text-surface-400 hover:opacity-80'}`}
                onClick={() => toggleDataset(0)}
              >
                <div className={`w-2.5 h-2.5 rounded-full ${hiddenDatasets[0] ? 'bg-surface-600' : 'bg-primary-500 shadow-[0_0_8px_rgba(167,139,250,0.6)]'}`}></div>
                Tech Score
              </div>
              <div
                className={`flex items-center gap-2 cursor-pointer transition-opacity select-none ${hiddenDatasets[1] ? 'opacity-50 text-surface-500' : 'text-surface-400 hover:opacity-80'}`}
                onClick={() => toggleDataset(1)}
              >
                <div className={`w-2.5 h-2.5 rounded-full ${hiddenDatasets[1] ? 'bg-surface-600' : 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]'}`}></div>
                Confidence
              </div>
            </div>
          </div>
          <div className="h-64 w-full relative z-10">
            {progress && progress.length > 0 ? (
              <Line data={lineChartData} options={lineChartOptions} />
            ) : (
              <div className="h-full flex items-center justify-center text-surface-400 font-medium text-sm bg-surface-900/20 rounded-2xl border border-surface-600/20">Not enough data to display progress</div>
            )}
          </div>
        </div>

        {/* Target Competency Analysis */}
        <div className="glass-card rounded-3xl p-8 flex flex-col relative overflow-hidden">
          <div className="flex justify-between items-center mb-8 relative z-10">
            <h3 className="text-[10px] font-black tracking-widest text-surface-400 uppercase">Performance By Role</h3>
            <div className="w-8 h-8 rounded-full bg-surface-700/30 flex items-center justify-center border border-white/[0.06]">
              <svg className="w-4 h-4 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
              </svg>
            </div>
          </div>
          <div className="space-y-6 flex-1 flex flex-col justify-center relative z-10">
            {byRole && byRole.length > 0 ? byRole.map((role: RoleItem, idx: number) => (
              <div key={idx} className="group">
                <div className="flex justify-between items-center text-xs font-bold text-surface-200 mb-3 group-hover:text-white transition-colors">
                  <span
                    className="truncate pr-4"
                    title={role._id.length >= 50 ? `${role._id.trim()}...` : role._id}
                  >
                    {role._id.length >= 50 ? `${role._id.trim()}...` : role._id}
                  </span>
                  <span className="text-primary-400 shrink-0 font-black">{Math.round(role.avgScore)}/100</span>
                </div>
                <div className="w-full bg-surface-900/60 rounded-full h-2 overflow-hidden shadow-inner shadow-black/40">
                  <div className="bg-primary-500 h-full rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(167,139,250,0.5)]" style={{ width: `${Math.round(role.avgScore)}%` }}></div>
                </div>
              </div>
            )) : (
              <div className="h-full flex items-center justify-center text-surface-400 font-medium text-sm bg-surface-900/20 rounded-2xl border border-surface-600/20">No role data available</div>
            )}
          </div>
        </div>
      </div>

      {/* Speech Behavioral Analytics */}
      {speech && (
        <div className="glass-card rounded-3xl p-8 relative overflow-hidden mt-6">
          <div className="flex items-center gap-5 mb-10 relative z-10">
            <div className="w-12 h-12 rounded-2xl bg-violet-500/10 flex items-center justify-center text-violet-400 border border-violet-500/20 shadow-[0_0_15px_rgba(139,92,246,0.1)]">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <div>
              <h3 className="text-white font-black text-xl font-display tracking-tight">Average Speech Patterns</h3>
              <p className="text-[13px] text-surface-400 font-medium mt-1">Real-time linguistic patterns from your sessions</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-6 divide-y md:divide-y-0 md:divide-x divide-surface-600/30 relative z-10">
            {/* Ring 1 */}
            <div className="flex flex-col items-center justify-center pt-6 md:pt-0">
              <div className="relative w-36 h-36 mb-6">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" className="text-surface-700" strokeWidth="6" />
                  <circle
                    cx="50" cy="50" r="45" fill="none" stroke="currentColor" className="text-primary-400 transition-all duration-1000 ease-out" strokeWidth="6"
                    strokeDasharray="282.7"
                    strokeDashoffset={282.7 - (282.7 * (Math.min(speech.avgPace, 200) / 200))}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-4xl font-black text-white font-display">{Math.round(speech.avgPace)}</span>
                  <span className="text-[10px] font-black text-surface-400 uppercase tracking-widest mt-1">WPM</span>
                </div>
              </div>
              <div className="text-center">
                <div className="text-white font-bold text-[15px] mb-1.5">Average Pace</div>
                <div className="text-primary-400 text-xs font-bold uppercase tracking-widest">Words per minute</div>
              </div>
            </div>

            {/* Ring 2 */}
            <div className="flex flex-col items-center justify-center pt-6 md:pt-0">
              <div className="relative w-36 h-36 mb-6">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" className="text-surface-700" strokeWidth="6" />
                  <circle
                    cx="50" cy="50" r="45" fill="none" stroke="currentColor" className="text-amber-400 transition-all duration-1000 ease-out" strokeWidth="6"
                    strokeDasharray="282.7"
                    strokeDashoffset={282.7 - (282.7 * (Math.min(speech.avgFillerWords, 30) / 30))}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-4xl font-black text-white font-display">{Math.round(speech.avgFillerWords)}</span>
                  <span className="text-[10px] font-black text-surface-400 uppercase tracking-widest mt-1">COUNT</span>
                </div>
              </div>
              <div className="text-center">
                <div className="text-white font-bold text-[15px] mb-1.5">Average Filler Words</div>
                <div className="text-amber-400 text-xs font-bold uppercase tracking-widest">Per question</div>
              </div>
            </div>

            {/* Ring 3 */}
            <div className="flex flex-col items-center justify-center pt-6 md:pt-0">
              <div className="relative w-36 h-36 mb-6">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" className="text-surface-700" strokeWidth="6" />
                  <circle
                    cx="50" cy="50" r="45" fill="none" stroke="currentColor" className="text-indigo-400 transition-all duration-1000 ease-out" strokeWidth="6"
                    strokeDasharray="282.7"
                    strokeDashoffset={282.7 - (282.7 * (speech.avgClarity / 100))}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-4xl font-black text-white font-display">{Math.round(speech.avgClarity)}</span>
                  <span className="text-[10px] font-black text-surface-400 uppercase tracking-widest mt-1">SCORE</span>
                </div>
              </div>
              <div className="text-center">
                <div className="text-white font-bold text-[15px] mb-1.5">Clarity Score</div>
                <div className="text-indigo-400 text-xs font-bold uppercase tracking-widest">Overall clarity</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Achievements & Badges Gallery */}
      <div className="glass-card rounded-3xl p-8 relative overflow-hidden mt-6">
        <div className="flex items-center gap-5 mb-10 relative z-10">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-400 border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.1)]">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          </div>
          <div>
            <h3 className="text-white font-black text-xl font-display tracking-tight">Achievements & Badges</h3>
            <p className="text-[13px] text-surface-400 font-medium mt-1">Unlock badges by pushing your limits and practicing consistently</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 relative z-10">
          {ACHIEVEMENTS.map((badge) => {
            const isUnlocked = gamification?.badges?.some((b) => b.badgeId === badge.id);
            const badgeRecord = gamification?.badges?.find((b) => b.badgeId === badge.id);
            
            return (
              <div 
                key={badge.id} 
                className={`p-5 rounded-2xl border transition-all duration-500 flex flex-col items-center text-center gap-3 relative overflow-hidden group
                  ${isUnlocked 
                    ? 'bg-surface-900/40 border-amber-500/30 shadow-[inset_0_0_20px_rgba(245,158,11,0.05)] hover:border-amber-500/50 hover:shadow-[0_0_15px_rgba(245,158,11,0.15)]' 
                    : 'bg-surface-900/20 border-white/5 opacity-60 grayscale hover:grayscale-0 hover:opacity-100'}`}
              >
                {isUnlocked && (
                  <div className="absolute -top-10 -right-10 w-20 h-20 bg-amber-500/20 blur-2xl rounded-full"></div>
                )}
                
                <div className={`text-4xl ${!isUnlocked && 'opacity-50'}`}>
                  {badge.icon}
                </div>
                
                <div className="space-y-1">
                  <h4 className={`text-sm font-black ${isUnlocked ? 'text-amber-400' : 'text-surface-400'}`}>
                    {badge.name}
                  </h4>
                  <p className="text-[10px] text-surface-500 font-medium leading-snug">
                    {badge.desc}
                  </p>
                </div>

                {isUnlocked && badgeRecord?.earnedAt && (
                  <div className="text-[9px] font-bold text-amber-500/60 uppercase tracking-widest mt-auto pt-2 border-t border-amber-500/10 w-full">
                    {new Date(badgeRecord.earnedAt).toLocaleDateString()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Resume Analysis History */}
      <ResumeAnalysisHistory />
    </div>
  );
};

export default AnalyticsDashboard;
