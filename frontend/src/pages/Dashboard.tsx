import { useState, useEffect } from "react"
import { useSelector, useDispatch } from "react-redux"
import { useNavigate } from "react-router-dom"
import { deleteSession, getSession } from "../features/session/sessionSlice"
import type { RootState, AppDispatch } from "../app/store"
import { toast } from "react-toastify"
import SessionCard from "../components/SessionCard"
import SkeletonSessionCard from "../components/SkeletonSessionCard"
import ConfirmModal from "../components/ConfirmModal"
import type { Session } from "../types/session"


import NewInterviewForm from "../components/NewInterviewForm"
import { ResumeHistoryWidget } from "../features/resume/components/ResumeHistoryWidget"
import { GamificationWidget } from "../features/gamification/components/GamificationWidget"
import { motion } from "framer-motion"
import apiClient from "../services/apiClient"

/**
 * Dashboard Component
 * 
 * The primary control center for the user. It allows users to:
 * - View a summary of their interview activity (Total, Completed, Pending).
 * - Preview and confirm persisted junior interview plans via the NewInterviewForm.
 * - Access historical interview records and analytics.
 */
const Dashboard = () => {
    const dispatch = useDispatch<AppDispatch>()
    const navigate = useNavigate()
    const { user } = useSelector((state: RootState) => state.auth)
    const { sessions, isLoading, isError, message, pagination, stats } = useSelector((state: RootState) => state.session)
    const [modalConfig, setModalConfig] = useState({
        isOpen: false,
        sessionId: '',
    })
    const [isContentReviewer, setIsContentReviewer] = useState(false)
    const [appRole, setAppRole] = useState("user")

    useEffect(() => {
        let active = true
        void apiClient.get("/admin/me").then(response => {
            if (active) {
                setAppRole(response.data?.role || "user")
                setIsContentReviewer(["owner", "admin", "reviewer"].includes(response.data?.role))
            }
        }).catch(() => { if (active) { setAppRole("user"); setIsContentReviewer(false) } })
        return () => { active = false }
    }, [])

    useEffect(() => {
        dispatch(getSession())
    }, [dispatch]);

    useEffect(() => {
        if (isError && message) {
            toast.error(message);
        }
    }, [isError, message, dispatch]);

    const viewSession = (session: Session) => {
        if (session.planId && session.status === 'pending') {
            navigate(`/plans/${session.planId}`)
        } else if (session.status === 'completed') {
            navigate(`/review/${session._id}`)
        } else if (session.status === 'in-progress') {
            navigate(`/interview/${session._id}`)
        } else {
            toast.info("Session not ready yet")
        }
    }

    const handleDelete = (e: React.MouseEvent, sessionId: string) => {
        e.stopPropagation()
        setModalConfig({
            isOpen: true,
            sessionId: sessionId,
        })
    }

    const confirmDelete = () => {
        if (modalConfig.sessionId) {
            dispatch(deleteSession(modalConfig.sessionId));
            toast.success("Session deleted successfully");
            setModalConfig({ isOpen: false, sessionId: '' });
        }
    }

    const loadMore = () => {
        if (pagination && pagination.currentPage < pagination.totalPages) {
            dispatch(getSession({ page: pagination.currentPage + 1 }));
        }
    }

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1
            }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 }
    };

    // Calculate stats globally
    const totalSessions = stats?.totalSessions || 0;
    const completedSessions = stats?.completedSessions || 0;
    const activeSessions = stats?.activeSessions || 0;

    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-16">
            {/* Header Section */}
            <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex flex-col sm:flex-row sm:items-end justify-between gap-8 pb-4"
            >
                <div className="space-y-4">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.04] border border-white/10">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-surface-300">Ready to Practice</span>
                    </div>
                    <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-none font-display">
                        Welcome, <span className="text-transparent bg-clip-text bg-linear-to-b from-white to-zinc-500 pr-4">{user?.name?.split(' ')[0]}</span>
                    </h1>
                    <p className="text-surface-400 text-base sm:text-lg font-medium max-w-md leading-relaxed">
                        Precision practice for high-stakes interviews. Level up your performance today.
                    </p>
                </div>

                {/* Stats — icon chips + violet accents */}
                <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto shrink-0">
                    <div className="stat-tile flex items-center gap-4 px-6 py-4 flex-1 lg:flex-none lg:min-w-44">
                        <span className="w-11 h-11 rounded-2xl bg-primary-500/10 border border-primary-500/25 text-primary-300 flex items-center justify-center shrink-0 shadow-[0_0_14px_rgba(139,92,246,0.12)]">
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
                        </span>
                        <div>
                            <p className="text-[26px] font-black text-white font-display leading-none">{totalSessions}</p>
                            <p className="text-[9px] text-surface-500 font-black uppercase tracking-[0.2em] mt-1.5 whitespace-nowrap">Sessions</p>
                        </div>
                    </div>
                    <div className="stat-tile flex items-center gap-4 px-6 py-4 flex-1 lg:flex-none lg:min-w-44">
                        <span className="w-11 h-11 rounded-2xl bg-primary-500/10 border border-primary-500/25 text-primary-300 flex items-center justify-center shrink-0 shadow-[0_0_14px_rgba(139,92,246,0.12)]">
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                        </span>
                        <div>
                            <p className="text-[26px] font-black text-primary-300 font-display leading-none">{completedSessions}</p>
                            <p className="text-[9px] text-surface-500 font-black uppercase tracking-[0.2em] mt-1.5 whitespace-nowrap">Completed</p>
                        </div>
                    </div>
                    {activeSessions > 0 && (
                        <div className="stat-tile flex items-center gap-4 px-6 py-4 flex-1 lg:flex-none lg:min-w-44">
                            <span className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-300 flex items-center justify-center shrink-0 animate-pulse">
                                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                            </span>
                            <div>
                                <p className="text-[26px] font-black text-amber-300 font-display leading-none">{activeSessions}</p>
                                <p className="text-[9px] text-surface-500 font-black uppercase tracking-[0.2em] mt-1.5 whitespace-nowrap">In Progress</p>
                            </div>
                        </div>
                    )}
                </div>
            </motion.div>

            <div className="-mt-10 flex justify-end">
                {isContentReviewer && <button type="button" onClick={() => navigate("/content-editorial")}
                    className="mr-2 rounded-lg border border-cyan-300/30 px-4 py-2 text-sm text-cyan-100 hover:border-cyan-300/60">Editorial review</button>}
                {["owner", "admin"].includes(appRole) && <button type="button" onClick={() => navigate("/admin/team")}
                    className="mr-2 rounded-lg border border-violet-300/30 px-4 py-2 text-sm text-violet-100 hover:border-violet-300/60">Team access</button>}
                <button type="button" onClick={() => navigate("/share-interview-experience")}
                    className="rounded-lg border border-white/15 px-4 py-2 text-sm text-surface-200 hover:border-cyan-300/50 hover:text-cyan-200">
                    Share an interview experience
                </button>
            </div>

            {/* New Interview Card */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
                className="relative group z-20"
            >
                <div className="absolute -inset-1 bg-white/5 rounded-[2.5rem] blur-xl opacity-0 group-hover:opacity-50 transition duration-1000"></div>
                <div className="relative">
                    <NewInterviewForm preferredRole={user?.preferredRole} onCreated={id => { dispatch(getSession()); navigate(`/plans/${id}`); }} />
                </div>
            </motion.div>

            {/* Gamification Widget */}
            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="pt-4"
            >
                <div className="mb-8">
                    <GamificationWidget />
                </div>
            </motion.div>

            {/* Resume History Widget */}
            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="pt-4"
            >
                <ResumeHistoryWidget />
            </motion.div>

            {/* Interview History Section */}
            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="space-y-8 pb-12"
            >
                <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-black flex items-center gap-4 text-white font-display">
                        <span className="p-3 glass-card shadow-[0_0_15px_rgba(0,0,0,0.5)] rounded-2xl flex items-center justify-center">
                            <svg className="w-6 h-6 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                            </svg>
                        </span>
                        Interview <span className="text-surface-500">History</span>
                    </h2>
                    <div className="h-px grow mx-6 bg-white/5 hidden sm:block"></div>
                </div>

                <div className="grid gap-8">
                    {isLoading && (!sessions || !Array.isArray(sessions) || sessions.length === 0) ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {[1, 2, 3, 4, 5, 6].map((i) => (
                                <SkeletonSessionCard key={i} />
                            ))}
                        </div>
                    ) : (
                        (!sessions || !Array.isArray(sessions) || sessions.length === 0) ? (
                            <motion.div
                                variants={itemVariants}
                                className="glass-card rounded-[3rem] py-24 text-center border-dashed border-white/10 group/empty"
                            >
                                <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-8 border border-white/5 group-hover/empty:scale-110 transition-transform duration-500">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-surface-600"><circle cx="12" cy="12" r="10" /><path d="M8 12h8" /><path d="M12 8v8" /></svg>
                                </div>
                                <h3 className="text-xl font-black text-surface-300 font-display">No interviews yet</h3>
                                <p className="text-surface-500 mt-2 font-medium">Launch your first prep session above — your history will show up here.</p>
                            </motion.div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {sessions.map((session, index) => (
                                    <motion.div key={session._id || index} variants={itemVariants}>
                                        <SessionCard
                                            session={session}
                                            onClick={viewSession}
                                            onDelete={handleDelete}
                                        />
                                    </motion.div>
                                ))}
                            </div>
                        )
                    )}
                </div>

                {pagination && pagination.currentPage < pagination.totalPages && (
                    <div className="flex justify-center pt-8">
                        <button
                            onClick={loadMore}
                            disabled={isLoading}
                            className="btn-secondary px-8 py-3 text-[10px] font-black uppercase tracking-widest disabled:opacity-50 cursor-pointer"
                        >
                            {isLoading ? 'Loading...' : 'Load More Archives'}
                        </button>
                    </div>
                )}
            </motion.div>

            <ConfirmModal
                isOpen={modalConfig.isOpen}
                title="Delete Session?"
                message="This will permanently delete this interview session from your history. Are you sure?"
                confirmText="Delete"
                cancelText="Keep"
                onConfirm={confirmDelete}
                onCancel={() => setModalConfig({ isOpen: false, sessionId: '' })}
                isDanger={true}
            />
        </div>
    );
}

export default Dashboard
