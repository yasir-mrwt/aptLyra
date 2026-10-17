import { useEffect, lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import type { RootState } from "./app/store";
import type { AppDispatch } from "./app/store";
import { clearRole,fetchCurrentRole } from "./features/auth/roleSlice";
import useSocket from "./hooks/useSocket";
import { usePageMetadata } from "./hooks/usePageMetadata";
import { ToastContainer, Slide } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Header from "./components/Header";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import InterviewHistory from "./pages/InterviewHistory";
import Dashboard from "./pages/Dashboard";
import InterviewPlan from "./pages/InterviewPlan";
const InterviewRunner=lazy(()=>import("./pages/InterviewRunner"));
const SessionReview=lazy(()=>import("./pages/SessionReview"));
import PrivateRoute from "./components/PrivateRoute";
import PublicRoute from "./components/PublicRoute";
import NotFound from "./pages/NotFound";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useLocation } from "react-router-dom";
const ResumeAnalyzer=lazy(()=>import("./pages/ResumeAnalyzer"));
const Rank=lazy(()=>import("./pages/Rank"));
const AnalyticsDashboard=lazy(()=>import("./pages/AnalyticsDashboard"));
import ShareInterviewExperience from "./pages/ShareInterviewExperience";
const ContentEditorialConsole=lazy(()=>import("./pages/ContentEditorialConsole"));
const AdminTeamManagement=lazy(()=>import("./pages/AdminTeamManagement"));
import EditorialErrorBoundary from "./components/EditorialErrorBoundary";

function App() {
  const reduced=useReducedMotion();
  const dispatch=useDispatch<AppDispatch>();
  useSocket();
  const location = useLocation();
  usePageMetadata(location.pathname);
  const { user,isInitializing } = useSelector((state: RootState) => state.auth);
  const userId=user?.id||user?._id||null;
  useEffect(()=>{if(isInitializing)return;if(userId)void dispatch(fetchCurrentRole({userId}));else dispatch(clearRole());},[dispatch,isInitializing,userId]);

  return (
    <>
      <div className="landing-grid relative min-h-screen text-surface-300 overflow-x-hidden">
        {/* Soft top spotlight — same treatment as the landing page */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[50vh]"
          style={{
            background:
              "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(255,255,255,0.05), transparent 70%)",
          }}
        ></div>

        <ToastContainer
          position="bottom-right"
          autoClose={2200}
          newestOnTop
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme="dark"
          transition={Slide}
        />
        <Header />
        <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={reduced?false:{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced?{opacity:1}:{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="w-full"
            >
              <Suspense fallback={<p role="status" className="p-8">Preparing your workspace…</p>}>
              <Routes location={location} key={location.pathname}>
                <Route path="/" element={<Landing />} />
                <Route element={<PublicRoute />}>
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />
                  <Route path="/forgot-password" element={<ForgotPassword />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                </Route>

                <Route element={<PrivateRoute />} >
                  <Route path="/history" element={<InterviewHistory />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/plans/:planId" element={<InterviewPlan />} />
                  <Route path="/resume-analyzer" element={<ResumeAnalyzer />} />
                  <Route path="/rank" element={<Rank />} />
                  <Route path="/analytics" element={<AnalyticsDashboard />} />
                  <Route path="/share-interview-experience" element={<ShareInterviewExperience />} />
                  <Route path="/content-editorial" element={<EditorialErrorBoundary><ContentEditorialConsole /></EditorialErrorBoundary>} />
                  <Route path="/admin/team" element={<AdminTeamManagement />} />
                  <Route path="/interview/:sessionId" element={<InterviewRunner />} />
                  <Route path="/review/:sessionId" element={<SessionReview />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </>
  )
}

export default App
