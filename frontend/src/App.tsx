import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
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
import Dashboard from "./pages/Dashboard";
import InterviewPlan from "./pages/InterviewPlan";
import InterviewRunner from "./pages/InterviewRunner";
import SessionReview from "./pages/SessionReview";
import PrivateRoute from "./components/PrivateRoute";
import PublicRoute from "./components/PublicRoute";
import NotFound from "./pages/NotFound";

import { AnimatePresence, motion } from "framer-motion";
import { useLocation } from "react-router-dom";
import ResumeAnalyzer from "./pages/ResumeAnalyzer";
import AnalyticsDashboard from "./pages/AnalyticsDashboard";
import ShareInterviewExperience from "./pages/ShareInterviewExperience";
import ContentEditorialConsole from "./pages/ContentEditorialConsole";
import AdminTeamManagement from "./pages/AdminTeamManagement";
import EditorialErrorBoundary from "./components/EditorialErrorBoundary";

function App() {
  const dispatch=useDispatch<AppDispatch>();
  useSocket();
  const location = useLocation();
  usePageMetadata(location.pathname);
  const { user } = useSelector((state: RootState) => state.auth);
  const userId=user?.id||user?._id||null;
  useEffect(()=>{if(userId)void dispatch(fetchCurrentRole({userId}));else dispatch(clearRole());},[dispatch,userId]);

  // The landing page is a full-bleed experience with its own navbar —
  // rendered outside the app shell (Header + constrained <main>).
  if (location.pathname === "/") {
    if (user) return <Navigate to="/dashboard" replace />;
    return (
      <>
        <ToastContainer position="bottom-right" autoClose={2200} theme="dark" transition={Slide} />
        <Landing />
      </>
    );
  }

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
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="w-full"
            >
              <Routes location={location} key={location.pathname}>
                <Route element={<PublicRoute />}>
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />
                  <Route path="/forgot-password" element={<ForgotPassword />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                </Route>

                <Route element={<PrivateRoute />} >
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/plans/:planId" element={<InterviewPlan />} />
                  <Route path="/resume-analyzer" element={<ResumeAnalyzer />} />
                  <Route path="/analytics" element={<AnalyticsDashboard />} />
                  <Route path="/share-interview-experience" element={<ShareInterviewExperience />} />
                  <Route path="/content-editorial" element={<EditorialErrorBoundary><ContentEditorialConsole /></EditorialErrorBoundary>} />
                  <Route path="/admin/team" element={<AdminTeamManagement />} />
                  <Route path="/interview/:sessionId" element={<InterviewRunner />} />
                  <Route path="/review/:sessionId" element={<SessionReview />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </>
  )
}

export default App
