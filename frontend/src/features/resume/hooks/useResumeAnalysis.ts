/**
 * @file hooks/useResumeAnalysis.ts
 * @description 
 * ARCHITECTURE OVERVIEW:
 * This custom hook acts as the central state manager for the Resume Analysis flow.
 * Instead of long-polling the backend for ML status updates, it establishes a lightweight 
 * WebSocket (`Socket.IO`) connection to listen for real-time progress events from the BullMQ workers.
 * It perfectly synchronizes the UI with the async AI backend pipeline.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { toast } from "react-toastify";
import { getResume } from "../../../services/resumeApi";
import type { ResumeData, ResultTab } from "../types";

interface UseResumeAnalysisProps {
  userId?: string;
}

export const useResumeAnalysis = ({ userId }: UseResumeAnalysisProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [resumeData, setResumeData] = useState<ResumeData | null>(null);
  const [activeTab, setActiveTab] = useState<ResultTab>("extraction");
  const [streamingFeedbackText, setStreamingFeedbackText] = useState("");
  const socketRef = useRef<Socket | null>(null);

  const fetchResumeDetails = useCallback(async (id: string) => {
    try {
      const data = await getResume(id);
      setResumeData(data);
      setIsUploading(false);
      setStatus(null);
    } catch (error) {
      console.error("Fetch error:", error);
      toast.error("Failed to fetch analysis results");
      setIsUploading(false);
    }
  }, []);

  useEffect(() => {
    if (!userId) return;

    const BACKEND_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace("/api", "");
    const socket: Socket = io(BACKEND_URL, {
      query: { userId },
      withCredentials: true,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("joinRoom", { userId });
    });

    socket.on("resume:status", (data: { status?: string; type?: string; chunk?: string; resumeId: string; error?: string }) => {
      if (data.type === "feedback_stream" && data.chunk) {
        setStreamingFeedbackText(prev => prev + data.chunk!);
      } else if (data.status) {
        setStatus(data.status);
        if (data.status === "completed") {
          fetchResumeDetails(data.resumeId);
        } else if (data.status === "failed") {
          toast.error(`Analysis failed: ${data.error || "Unknown error"}`);
          setIsUploading(false);
          setStatus(null);
        } else if (data.status === "invalid_document") {
          // Keep isUploading true to stay in the result view area where we will show the error UI
          setStatus("invalid_document");
        }
      }
    });

    socket.on("disconnect", (reason) => {
      console.log("Disconnected from resume processing socket:", reason);
    });

    const handleTokenRefresh = () => {
      if (socket.disconnected) {
        console.log("Token refreshed, attempting to reconnect resume socket...");
        socket.connect();
      }
    };
    window.addEventListener("auth_token_refreshed", handleTokenRefresh);

    return () => {
      window.removeEventListener("auth_token_refreshed", handleTokenRefresh);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [userId, fetchResumeDetails]);

    const getStatusMessage = () => {
    switch (status) {
      case "pending":
        return "Job enqueued…";
      case "processing":
        return "Extracting text from document…";
      case "parsed":
        return "Raw text extracted. Analyzing skills…";
      case "analyzing":
        return "AI is evaluating your profile…";
      case "matching":
        return "Matching against job description…";
      case "invalid_document":
        return "Invalid Document Detected";
      default:
        return "Processing…";
    }
  };

  const handleResetAnalysis = () => {
    setResumeData(null);
    setStatus(null);
    setIsUploading(false);
    setActiveTab("extraction");
    setStreamingFeedbackText("");
  };

  return {
    isUploading,
    setIsUploading,
    status,
    setStatus,
    resumeData,
    setResumeData,
    activeTab,
    setActiveTab,
    getStatusMessage,
    handleResetAnalysis,
    streamingFeedbackText,
    setStreamingFeedbackText,
    fetchResumeDetails,
  };
};
