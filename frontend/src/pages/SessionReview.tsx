import { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import type { RootState, AppDispatch } from "../app/store";
import { useParams, Link } from "react-router-dom";
import { getSessionById } from "../features/session/sessionSlice";
import type { Question } from "../types/session";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { PDFDownloadLink } from "@react-pdf/renderer";
import SessionReviewStats from "../components/SessionReviewStats";
import FeedbackItem from "../components/FeedbackItem";
import ReportCardPDF from "../components/ReportCardPDF";
import { formatDuration } from "../utils/formatters";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const SessionReview = () => {
    const { sessionId } = useParams<{ sessionId: string }>();
    const dispatch = useDispatch<AppDispatch>();
    const { activeSession, isLoading } = useSelector((state: RootState) => state.session);

    useEffect(() => {
        if (sessionId) {
            dispatch(getSessionById(sessionId));
        }
    }, [sessionId, dispatch]);

    if (isLoading) return <div className="text-center py-32 font-black text-surface-500 animate-pulse uppercase tracking-[0.3em] text-[10px]">Processing Intelligence...</div>

    if (!activeSession || activeSession.status !== 'completed') {
        return (
            <div className="max-w-2xl mx-auto mt-20 p-12 glass-card rounded-[3rem] text-center">
                <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-8 border border-white/5">
                    <span className="text-3xl">⌛</span>
                </div>
                <h2 className="text-2xl font-black text-white mb-4 tracking-tighter uppercase">Assessment In Progress</h2>
                <p className="text-surface-500 mb-10 font-bold text-xs uppercase tracking-widest leading-relaxed">
                    Our AI is currently synthesizing your performance data.<br />Please check back in a few moments.
                </p>
                <Link to="/dashboard" className="btn-primary inline-flex items-center gap-3">
                    Return to Home
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
                </Link>
            </div>
        );
    }

    const { overallScore, metrics, role, level, questions, startTime, endTime, company } = activeSession;
    const finalMetrics = metrics || {};

    const barData = {
        labels: (questions || []).map((_: unknown, i: number) => `Q${i + 1}`),
        datasets: [{
            label: 'Technical Mastery',
            data: (questions || []).map((q: Question) => q.technicalScore || 0),
            backgroundColor: (questions || []).map((q: Question) => (q.technicalScore || 0) > 70 ? '#8b5cf6' : '#6366f1'),
            borderRadius: 4,
            hoverBackgroundColor: '#a78bfa',
        }],
    };

    return (
        <div className="max-w-7xl mx-auto px-4 py-12 space-y-16 animate-in fade-in slide-in-from-bottom-4 duration-1000">
            <div className="flex flex-col gap-8">
                <div className="w-full">
                    <span className="text-primary-400 font-black uppercase tracking-[0.4rem] text-[10px] bg-primary-500/10 px-4 py-1.5 rounded-full border border-primary-500/20 shadow-[0_0_15px_rgba(139,92,246,0.1)]">Report Terminal</span>
                    <h1 className="text-4xl sm:text-6xl font-black text-white tracking-tighter mt-6 uppercase leading-[1.1] sm:leading-tight flex items-center gap-4 flex-wrap font-display">
                        {role} <span className="text-surface-600 font-bold block sm:inline whitespace-nowrap">/ {level}</span>
                        {company && company !== 'general' && (
                            <span className="text-sm bg-primary-500/20 text-primary-400 border border-primary-500/30 px-3 py-1 rounded-lg tracking-widest self-center mt-2 sm:mt-0">
                                {company.toUpperCase()}
                            </span>
                        )}
                    </h1>
                </div>
                <div className="flex gap-4 shrink-0 flex-col sm:flex-row sm:justify-end">
                    <span className="text-[10px] font-black uppercase tracking-widest text-surface-500 border border-white/5 px-4 py-2 rounded-xl flex items-center justify-center whitespace-nowrap">Session ID: {sessionId?.slice(-8)}</span>

                    <PDFDownloadLink
                        document={<ReportCardPDF session={activeSession} />}
                        fileName={`techvera-report-${(sessionId || "session").slice(-8)}.pdf`}
                        className="flex items-center justify-center gap-2 px-6 py-2 text-[10px] tracking-widest uppercase font-black print:hidden cursor-pointer bg-primary-600 hover:bg-primary-500 text-white transition-colors rounded-xl whitespace-nowrap"
                    >
                        {({ loading }) => (
                            <>
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><polyline points="9 15 12 18 15 15" /></svg>
                                {loading ? "Preparing..." : "Report Card PDF"}
                            </>
                        )}
                    </PDFDownloadLink>

                    <button onClick={() => window.print()} className="btn-secondary flex items-center justify-center gap-2 px-6! py-2! text-[10px] tracking-widest uppercase font-black print:hidden cursor-pointer hover:bg-white/10 transition-colors rounded-xl border border-white/5 whitespace-nowrap">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>
                        Export Report
                    </button>
                </div>
            </div>

            <SessionReviewStats
                overallScore={overallScore || 0}
                avgTechnical={finalMetrics.avgTechnical || 0}
                avgConfidence={finalMetrics.avgConfidence || 0}
                duration={formatDuration(startTime, endTime)}
            />

            <div className="glass-card rounded-3xl sm:rounded-[3rem] px-3 py-6 sm:p-10 relative group break-inside-avoid print:bg-surface-900 print:shadow-none transform-gpu">
                <div className="absolute top-0 right-0 p-5 sm:p-10 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity print:hidden hidden sm:block">
                    <svg className="w-32 h-32 sm:w-48 sm:h-48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.5"><path d="M12 20V10" /><path d="M18 20V4" /><path d="M6 20V16" /></svg>
                </div>
                <h3 className="text-[10px] font-black text-surface-500 mb-6 sm:mb-10 uppercase tracking-[0.3rem] flex items-center gap-3">
                    <span className="w-1.5 h-4 bg-indigo-500 rounded-full"></span>
                    Mastery Calibration
                </h3>
                <div className="relative w-full">
                    {/* Sticky Y-Axis Overlay */}
                    <div className="absolute left-0 top-0 bottom-4 w-[45px] z-10 bg-transparent border-r border-white/5 overflow-hidden pointer-events-none">
                        <div
                            className="h-64 sm:h-80"
                            style={{ width: `${Math.max(100, (questions?.length || 0) * 40)}px` }}
                        >
                            <Bar data={{
                                ...barData,
                                datasets: barData.datasets.map(ds => ({
                                    ...ds,
                                    backgroundColor: 'transparent',
                                    hoverBackgroundColor: 'transparent'
                                }))
                            }} options={{
                                maintainAspectRatio: false,
                                animation: false,
                                responsive: true,
                                plugins: { legend: { display: false }, tooltip: { enabled: false } },
                                scales: {
                                    y: {
                                        beginAtZero: true,
                                        max: 100,
                                        grid: { display: false },
                                        border: { display: false },
                                        ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10, weight: 'bold' } }
                                    },
                                    x: {
                                        grid: { display: false },
                                        border: { display: false },
                                        ticks: { color: 'transparent', font: { size: 10, weight: 'bold' } }
                                    }
                                }
                            }} />
                        </div>
                    </div>

                    {/* Scrolling Chart */}
                    <div className="w-full overflow-x-auto pb-4 custom-scrollbar" style={{ maskImage: 'linear-gradient(to right, transparent 0px, transparent 45px, black 45px, black 100%)', WebkitMaskImage: 'linear-gradient(to right, transparent 0px, transparent 45px, black 45px, black 100%)' }}>
                        <div
                            className="h-64 sm:h-80 relative print:max-w-[180mm] print:mx-auto pl-[45px]"
                            style={{ minWidth: `${Math.max(100, (questions?.length || 0) * 40) + 45}px` }}
                        >
                            <Bar data={barData} options={{
                                maintainAspectRatio: false,
                                animation: false,
                                responsive: true,
                                plugins: { legend: { display: false } },
                                scales: {
                                    y: {
                                        beginAtZero: true,
                                        max: 100,
                                        grid: { color: 'rgba(255,255,255,0.03)' },
                                        border: { display: false },
                                        ticks: { display: false }
                                    },
                                    x: {
                                        grid: { display: false },
                                        ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 10, weight: 'bold' } }
                                    }
                                }
                            }} />
                        </div>
                    </div>
                </div>
            </div>

            <div className="space-y-12">
                <div className="flex items-center gap-6 break-inside-avoid">
                    <h2 className="text-xl font-black uppercase tracking-widest text-white font-display">Question Narrative</h2>
                    <div className="h-px grow bg-white/5"></div>
                </div>
                <div className="grid gap-10">
                    {(questions || []).map((q: Question, index: number) => (
                        <FeedbackItem key={index} question={q} index={index} />
                    ))}
                </div>
            </div>
        </div>
    )
}

export default SessionReview;
