import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "../app/store";
import { getAnalytics } from "../features/analytics/analyticsSlice";
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
  Filler,
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
  Filler,
);

const AnalyticsDashboard: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { data, isLoading, isError, message } = useSelector(
    (state: RootState) => state.analytics,
  );

  const [hiddenDatasets, setHiddenDatasets] = useState<Record<number, boolean>>(
    {
      0: false,
      1: false,
    },
  );

  const toggleDataset = (index: number) => {
    setHiddenDatasets((prev) => ({
      ...prev,
      [index]: !prev[index],
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
          <svg
            className="w-8 h-8 text-rose-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <p className="text-rose-400 font-bold text-lg">
          Failed to load analytics
        </p>
        <p className="text-surface-400 text-sm mt-2">{message}</p>
      </div>
    );
  }

  if (!data) return null;

  const { stats, progress, byRole, speech } = data;

  // Progress Over Time Chart
  const technicalScores =
    progress?.map((p: ProgressItem) => p.technicalScore) || [];
  const confidenceScores =
    progress?.map((p: ProgressItem) => p.confidenceScore) || [];
  const progressLabels =
    progress?.map((p: ProgressItem) => {
      const parts = String(p.date).split("-");
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
    ],
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
      },
    },
    scales: {
      y: {
        min: 0,
        max: 100,
        grid: { color: "rgba(255,255,255,0.05)" },
        ticks: {
          color: "#94A3B8",
          font: { family: "'Inter', sans-serif", weight: "bold" },
        },
      },
      x: {
        grid: { color: "rgba(255,255,255,0.05)" },
        ticks: {
          color: "#94A3B8",
          font: { size: 10, family: "'Inter', sans-serif", weight: "bold" },
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 8,
        },
      },
    },
  };

  return (
    <div className="product-workspace space-y-6 max-w-[1200px] mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8">
        <div>
          <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-3 font-display">
            Performance Insights
          </h1>
          <p className="text-surface-300 font-medium max-w-2xl text-[15px]">
            Your saved practice, reviewed scoring coverage and participation
            progress.
          </p>
        </div>
      </div>

      <section className="glass-card p-6 rounded-2xl space-y-3"><h2 className="text-2xl">Individual practice</h2><p>{data.practice?.completed ?? 0} completed interviews · {data.practice?.mean == null ? "No scored answers yet" : `${data.practice.mean}/100 across ${data.practice.scoredAnswers} scored answers`}</p><p>Only saved numeric scores count. Provisional, unanswered and abstained answers are never filled with zero. This is separate from reviewed aggregate eligibility.</p><ul>{data.practice?.topics.map(topic=><li key={topic.topic}>{topic.topic}: {topic.mean}/100 · {topic.scored} scored answers</li>)}</ul></section>
      <section className="glass-card p-6 rounded-2xl">
        <h2>Reviewed rubric evaluation</h2>
        <p>
          {data.evaluation?.reviewedMean == null
            ? "Insufficient reviewed coverage"
            : `Reviewed mean: ${data.evaluation.reviewedMean}/100`}{" "}
          · {data.evaluation?.reviewedScoredSessions || 0} eligible sessions ·{" "}
          {data.evaluation?.provisional || 0} provisional ·{" "}
          {data.evaluation?.abstained || 0} abstained
        </p>
        <p>
          Score trends below use historical legacy evaluations only. Delivery
          feedback is separate from evaluator confidence.
        </p>
      </section>
      <p className="glass-card p-5">{stats?.totalSessions||0} historical legacy interviews in the charts below. Current individual practice and reviewed coverage are shown above.</p>
      {/* Middle Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Skill Acquisition Velocity */}
        <div className="glass-card rounded-3xl p-8 flex flex-col relative overflow-hidden">
          <div className="flex justify-between items-center mb-8 relative z-10">
            <h3 className="text-[10px] font-black tracking-widest text-surface-400 uppercase">
              Progress Over Time
            </h3>
            <div className="flex gap-4 text-[10px] font-black uppercase tracking-widest">
              <div
                className={`flex items-center gap-2 cursor-pointer transition-opacity select-none ${hiddenDatasets[0] ? "opacity-50 text-surface-500" : "text-surface-400 hover:opacity-80"}`}
                onClick={() => toggleDataset(0)}
              >
                <div
                  className={`w-2.5 h-2.5 rounded-full ${hiddenDatasets[0] ? "bg-surface-600" : "bg-primary-500 shadow-[0_0_8px_rgba(167,139,250,0.6)]"}`}
                ></div>
                Tech Score
              </div>
              <div
                className={`flex items-center gap-2 cursor-pointer transition-opacity select-none ${hiddenDatasets[1] ? "opacity-50 text-surface-500" : "text-surface-400 hover:opacity-80"}`}
                onClick={() => toggleDataset(1)}
              >
                <div
                  className={`w-2.5 h-2.5 rounded-full ${hiddenDatasets[1] ? "bg-surface-600" : "bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]"}`}
                ></div>
                Confidence
              </div>
            </div>
          </div>
          <div className="h-64 w-full relative z-10">
            {progress && progress.length > 0 ? (
              <Line data={lineChartData} options={lineChartOptions} />
            ) : (
              <div className="h-full flex items-center justify-center text-surface-400 font-medium text-sm bg-surface-900/20 rounded-2xl border border-surface-600/20">
                Not enough data to display progress
              </div>
            )}
          </div>
        </div>

        {/* Target Competency Analysis */}
        <div className="glass-card rounded-3xl p-8 flex flex-col relative overflow-hidden">
          <div className="flex justify-between items-center mb-8 relative z-10">
            <h3 className="text-[10px] font-black tracking-widest text-surface-400 uppercase">
              Performance By Role
            </h3>
            <div className="w-8 h-8 rounded-full bg-surface-700/30 flex items-center justify-center border border-white/[0.06]">
              <svg
                className="w-4 h-4 text-surface-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"
                />
              </svg>
            </div>
          </div>
          <div className="space-y-6 flex-1 flex flex-col justify-center relative z-10">
            {byRole && byRole.length > 0 ? (
              byRole.map((role: RoleItem, idx: number) => (
                <div key={idx} className="group">
                  <div className="flex justify-between items-center text-xs font-bold text-surface-200 mb-3 group-hover:text-white transition-colors">
                    <span
                      className="truncate pr-4"
                      title={
                        role._id.length >= 50
                          ? `${role._id.trim()}...`
                          : role._id
                      }
                    >
                      {role._id.length >= 50
                        ? `${role._id.trim()}...`
                        : role._id}
                    </span>
                    <span className="text-primary-400 shrink-0 font-black">
                      {Math.round(role.avgScore)}/100
                    </span>
                  </div>
                  <div className="w-full bg-surface-900/60 rounded-full h-2 overflow-hidden shadow-inner shadow-black/40">
                    <div
                      className="bg-primary-500 h-full rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(167,139,250,0.5)]"
                      style={{ width: `${Math.round(role.avgScore)}%` }}
                    ></div>
                  </div>
                </div>
              ))
            ) : (
              <div className="h-full flex items-center justify-center text-surface-400 font-medium text-sm bg-surface-900/20 rounded-2xl border border-surface-600/20">
                No role data available
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Speech Behavioral Analytics */}
      {speech && (
        <div className="glass-card rounded-3xl p-8 relative overflow-hidden mt-6">
          <div className="flex items-center gap-5 mb-10 relative z-10">
            <div className="w-12 h-12 rounded-2xl bg-violet-500/10 flex items-center justify-center text-violet-400 border border-violet-500/20 shadow-[0_0_15px_rgba(139,92,246,0.1)]">
              <svg
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-white font-black text-xl font-display tracking-tight">
                Average Speech Patterns
              </h3>
              <p className="text-[13px] text-surface-400 font-medium mt-1">
                Real-time linguistic patterns from your sessions
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-6 divide-y md:divide-y-0 md:divide-x divide-surface-600/30 relative z-10">
            {/* Ring 1 */}
            <div className="flex flex-col items-center justify-center pt-6 md:pt-0">
              <div className="relative w-36 h-36 mb-6">
                <svg
                  className="w-full h-full transform -rotate-90"
                  viewBox="0 0 100 100"
                >
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke="currentColor"
                    className="text-surface-700"
                    strokeWidth="6"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke="currentColor"
                    className="text-primary-400 transition-all duration-1000 ease-out"
                    strokeWidth="6"
                    strokeDasharray="282.7"
                    strokeDashoffset={
                      282.7 - 282.7 * (Math.min(speech.avgPace, 200) / 200)
                    }
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-4xl font-black text-white font-display">
                    {Math.round(speech.avgPace)}
                  </span>
                  <span className="text-[10px] font-black text-surface-400 uppercase tracking-widest mt-1">
                    WPM
                  </span>
                </div>
              </div>
              <div className="text-center">
                <div className="text-white font-bold text-[15px] mb-1.5">
                  Average Pace
                </div>
                <div className="text-primary-400 text-xs font-bold uppercase tracking-widest">
                  Words per minute
                </div>
              </div>
            </div>

            {/* Ring 2 */}
            <div className="flex flex-col items-center justify-center pt-6 md:pt-0">
              <div className="relative w-36 h-36 mb-6">
                <svg
                  className="w-full h-full transform -rotate-90"
                  viewBox="0 0 100 100"
                >
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke="currentColor"
                    className="text-surface-700"
                    strokeWidth="6"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke="currentColor"
                    className="text-amber-400 transition-all duration-1000 ease-out"
                    strokeWidth="6"
                    strokeDasharray="282.7"
                    strokeDashoffset={
                      282.7 - 282.7 * (Math.min(speech.avgFillerWords, 30) / 30)
                    }
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-4xl font-black text-white font-display">
                    {Math.round(speech.avgFillerWords)}
                  </span>
                  <span className="text-[10px] font-black text-surface-400 uppercase tracking-widest mt-1">
                    COUNT
                  </span>
                </div>
              </div>
              <div className="text-center">
                <div className="text-white font-bold text-[15px] mb-1.5">
                  Average Filler Words
                </div>
                <div className="text-amber-400 text-xs font-bold uppercase tracking-widest">
                  Per question
                </div>
              </div>
            </div>

            {/* Ring 3 */}
            <div className="flex flex-col items-center justify-center pt-6 md:pt-0">
              <div className="relative w-36 h-36 mb-6">
                <svg
                  className="w-full h-full transform -rotate-90"
                  viewBox="0 0 100 100"
                >
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke="currentColor"
                    className="text-surface-700"
                    strokeWidth="6"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke="currentColor"
                    className="text-indigo-400 transition-all duration-1000 ease-out"
                    strokeWidth="6"
                    strokeDasharray="282.7"
                    strokeDashoffset={282.7 - 282.7 * (speech.avgClarity / 100)}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-4xl font-black text-white font-display">
                    {Math.round(speech.avgClarity)}
                  </span>
                  <span className="text-[10px] font-black text-surface-400 uppercase tracking-widest mt-1">
                    SCORE
                  </span>
                </div>
              </div>
              <div className="text-center">
                <div className="text-white font-bold text-[15px] mb-1.5">
                  Clarity Score
                </div>
                <div className="text-indigo-400 text-xs font-bold uppercase tracking-widest">
                  Overall clarity
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AnalyticsDashboard;
