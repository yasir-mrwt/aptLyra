import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import type { TooltipItem, ChartOptions } from "chart.js";
import { getUserResumes } from "../../../services/resumeApi";
import type { ResumeData } from "../types";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export const ResumeHistoryWidget = () => {
  const [resumes, setResumes] = useState<ResumeData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const { data } = await getUserResumes();
        // Sort chronologically (oldest to newest) for the line chart
        const sorted = data.sort((a: ResumeData, b: ResumeData) =>
          new Date(a.createdAt || "").getTime() - new Date(b.createdAt || "").getTime()
        );
        setResumes(sorted);
      } catch (error) {
        console.error("Failed to fetch resume history:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchHistory();
  }, []);

  if (isLoading) {
    return (
      <div className="glass-card rounded-3xl p-8 min-h-[300px] flex items-center justify-center animate-pulse">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 rounded-full border-4 border-primary-500/20 border-t-primary-500 animate-spin mb-4" />
          <span className="text-surface-500 text-sm font-bold uppercase tracking-widest">Loading History...</span>
        </div>
      </div>
    );
  }

  if (resumes.length === 0) {
    return null; // Hide if no history
  }

  // Extract ATS scores
  const chartData = resumes.map(r => {
    const atsScore = r.scores?.ats || r.analysisReport?._v2?.scores?.ats_score || 0;
    return atsScore;
  });

  const labels = resumes.map(r => {
    const d = new Date(r.createdAt || "");
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  const data = {
    labels,
    datasets: [
      {
        label: "ATS Score",
        data: chartData,
        fill: true,
        backgroundColor: "rgba(167, 139, 250, 0.1)", // primary-400
        borderColor: "#a78bfa", // primary-400
        borderWidth: 2,
        pointBackgroundColor: "#a78bfa",
        pointBorderColor: "#fff",
        pointHoverBackgroundColor: "#fff",
        pointHoverBorderColor: "#a78bfa",
        pointRadius: chartData.length > 30 ? 1 : (chartData.length > 15 ? 3 : 5),
        pointHoverRadius: 6,
        tension: 0.4, // smooth curve
      },
    ],
  };

  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: "#1e293b",
        titleFont: { family: "Inter", size: 13 },
        bodyFont: { family: "Inter", size: 14, weight: "bold" as const },
        padding: 12,
        cornerRadius: 8,
        displayColors: false,
        callbacks: {
          label: function (context: TooltipItem<"line">) {
            return `ATS Score: ${context.parsed.y}`;
          },
        },
      },
    },
    scales: {
      y: {
        min: 0,
        max: 100,
        grid: {
          color: "rgba(255, 255, 255, 0.05)",
        },
        ticks: {
          color: "#94a3b8",
          font: { family: "Inter", size: 11 },
          stepSize: 20,
        },
        border: { dash: [4, 4] },
      },
      x: {
        grid: {
          display: false,
        },
        ticks: {
          color: "#94a3b8",
          font: { family: "Inter", size: 10 },
          maxTicksLimit: 6,
          maxRotation: 45,
          minRotation: 0,
        },
      },
    },
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-3xl sm:rounded-[3rem] p-6 sm:p-8 relative overflow-hidden w-full"
    >
      <div className="absolute top-0 right-0 w-64 h-64 bg-primary-500/10 rounded-full blur-[80px] -mr-32 -mt-32 pointer-events-none" />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 sm:mb-8 gap-4 sm:gap-0">
        <div>
          <h2 className="text-lg sm:text-xl font-black text-white flex items-center gap-2 sm:gap-3 font-display">
            <span className="p-3 glass-card shadow-[0_0_15px_rgba(0,0,0,0.5)] rounded-2xl flex items-center justify-center">
              <svg className="w-6 h-6 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
              </svg>
            </span>
            ATS Score History
          </h2>
          <p className="text-surface-400 text-xs sm:text-sm mt-1 font-medium">
            Track your resume improvements over time
          </p>
        </div>
        <div className="px-3 sm:px-4 py-1.5 rounded-full bg-surface-800 border border-white/5 text-[10px] sm:text-xs font-bold text-surface-300 self-start sm:self-auto whitespace-nowrap">
          {resumes.length} Scans
        </div>
      </div>

      <div className="h-[200px] sm:h-[250px] w-full relative">
        <Line data={data} options={options} />
      </div>
    </motion.div>
  );
};
