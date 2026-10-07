import { useState, useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import type { AppDispatch, RootState } from "../app/store";
import type { DraftRecord,Session } from "../types/session";
import { getSessionById, submitAnswer, endSession } from "../features/session/sessionSlice";
import { ROLE_LANGUAGE_MAP } from "../constants/interview";
import { saveDrafts, getDrafts, deleteDrafts } from "../utils/idb";

import api from "../services/api";

/**
 * Custom hook to manage the lifecycle of an interview session runner.
 * Handles question state, draft persistence (via IDB), answer submission logic, 
 * and real-time socket synchronization.
 * 
 * @param stopRecording - Callback to stop the active audio recorder.
 * @param setRecordingTime - Callback to reset timer UI.
 * @param recordingStartTime - Unix timestamp of when the session recording began.
 */
export const useInterviewSession = (stopRecording: () => Promise<Blob | null>, setRecordingTime: (time: number) => void) => {
    const { sessionId } = useParams<{ sessionId: string }>();
    const navigate = useNavigate();
    const dispatch = useDispatch<AppDispatch>();
    const { activeSession:loadedSession, isLoading, isError: sessionError, message: sessionMessage,socketConnection } = useSelector((state: RootState) => state.session);
    const activeSession=loadedSession?._id===sessionId?loadedSession:null;

    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    // Derive selected language securely without side-effects (React paradigm)
    const [languageOverride, setLanguageOverride] = useState<string | null>(null);
    const defaultLang = activeSession?.role ? ROLE_LANGUAGE_MAP[activeSession.role] || "plaintext" : "javascript";
    const selectedLanguage = activeSession?.planId ? activeSession.questions[currentQuestionIndex]?.language || defaultLang : languageOverride ?? defaultLang;
    const setSelectedLanguage = setLanguageOverride;

    const submittingRef = useRef(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submittedLocal, setSubmittedLocal] = useState<Record<number, boolean>>({});
    const restoredSession=useRef<string|null>(null);

    // Initial drafts state from IDB with empty fallback
    const [drafts, setDrafts] = useState<DraftRecord>({});

    useEffect(() => {
        if (!sessionId) return;
        getDrafts(sessionId).then(saved => {
            if (saved && Object.keys(saved).length > 0) {
                setDrafts(saved);
            } else {
                // LocalStorage Migration Fallback
                const savedStr = localStorage.getItem(`draft_code_${sessionId}`);
                if (savedStr) {
                    try {
                        const parsed = JSON.parse(savedStr);
                        const migrated: Record<number, { code?: string; audio?: Blob; diagram?: Blob; diagramElements?: readonly unknown[] }> = {};
                        Object.keys(parsed).forEach(key => {
                            migrated[parseInt(key)] = { code: parsed[key] };
                        });
                        setDrafts(migrated);
                    } catch (e) {
                        console.error("JSON parse failed", e);
                    }
                }
            }
        });
    }, [sessionId]);

    useEffect(() => {
        if (sessionId && Object.keys(drafts).length > 0) {
            saveDrafts(sessionId, drafts);
        }
    }, [drafts, sessionId]);

    useEffect(() => {
        if (sessionId) {
            dispatch(getSessionById(sessionId));
        }
    }, [dispatch, sessionId]);

    const currentQuestion = activeSession?.questions?.[currentQuestionIndex];
    const durable=activeSession?.runtimeVersion==="aptlyra-runtime-v1";
    const unfinished=activeSession?.operations?.some(op=>["queued","running","retryable_failed"].includes(op.status));
    const currentOperation=activeSession?.operations?.find(op=>op.id===currentQuestion?.operationId);

    useEffect(()=>{
        if(!sessionId || !durable || activeSession?._id!==sessionId)return;
        const refresh=()=>{void dispatch(getSessionById(sessionId));};
        if(activeSession.status==="completed"){
            localStorage.removeItem(`draft_code_${sessionId}`);void deleteDrafts(sessionId);navigate(`/review/${sessionId}`);return;
        }
        const timer=window.setInterval(refresh,2000);
        window.addEventListener("online",refresh);window.addEventListener("focus",refresh);
        return()=>{window.clearInterval(timer);window.removeEventListener("online",refresh);window.removeEventListener("focus",refresh);};
    },[sessionId,durable,activeSession?._id,activeSession?.status,dispatch,navigate]);

    useEffect(()=>{
        if(!sessionId || activeSession?._id!==sessionId || restoredSession.current===sessionId)return;
        const pending=activeSession.operations?.find(op=>op.type==="evaluate" && ["queued","running","retryable_failed"].includes(op.status));
        const first=activeSession.questions.findIndex(q=>!q.isEvaluated);
        const timer=window.setTimeout(()=>{restoredSession.current=sessionId;setCurrentQuestionIndex(pending?.questionIndex ?? Math.max(0,first));},0);
        return()=>window.clearTimeout(timer);
    },[sessionId,activeSession]);
    const isReduxSubmitted = currentQuestion?.isSubmitted === true;
    const isLocallySubmitted = submittedLocal[currentQuestionIndex] === true;
    const isEvaluationError = !!currentQuestion?.processingError || (sessionError && /failed|error/i.test(sessionMessage));

    useEffect(() => {
        if (isEvaluationError && isLocallySubmitted) {
            const timer = window.setTimeout(() => {
                setSubmittedLocal(prev => ({
                    ...prev, [currentQuestionIndex]: false
                }));
            }, 0);
            toast.error(sessionMessage, { toastId: "eval-error" });
            return () => window.clearTimeout(timer);
        }
    }, [isEvaluationError, isLocallySubmitted, currentQuestionIndex, sessionMessage]);

    const isQuestionLocked = activeSession?.status !== "in-progress" || activeSession?.runtimeState==="finishing" || !!unfinished || isSubmitting || isReduxSubmitted || (isLocallySubmitted && !isEvaluationError);
    const isProcessing = activeSession?.status === "in-progress" && !currentQuestion?.isEvaluated && (durable?
        isSubmitting || !!(currentOperation && (["queued","running"].includes(currentOperation.status) || currentOperation.nextRetryAt)):
        (isSubmitting || isReduxSubmitted || (isLocallySubmitted && !isEvaluationError)));

    const handleNavigation = async (index: number) => {
        if (submittingRef.current) return;
        if (activeSession?.questions && index >= 0 && index < activeSession.questions.length) {
            await stopRecording();
            setCurrentQuestionIndex(index);
            setRecordingTime(0);
        }
    };



    const updateDraftCode = (newCode: string | undefined) => {
        if (isQuestionLocked) return;

        const codeText = newCode ?? "";

        setDrafts(prev => ({
            ...prev,
            [currentQuestionIndex]: { ...prev[currentQuestionIndex], code: codeText }
        }));
    };

    const updateDraftAudio = (audioBlob: Blob) => {
        setDrafts(prev => ({
            ...prev,
            [currentQuestionIndex]: { ...prev[currentQuestionIndex], audio: audioBlob }
        }));
    };

    const updateDraftAnswer = (answerText: string) => {
        if (isQuestionLocked) return;
        setDrafts(prev => ({ ...prev, [currentQuestionIndex]: { ...prev[currentQuestionIndex], answerText } }));
    };

    const updateDraftDiagram = (diagramBlob: Blob, elements: readonly unknown[]) => {
        setDrafts(prev => ({
            ...prev,
            [currentQuestionIndex]: { ...prev[currentQuestionIndex], diagram: diagramBlob, diagramElements: elements }
        }));
    };

    const deleteDraftAudio = () => {
        setDrafts(prev => ({
            ...prev,
            [currentQuestionIndex]: { ...prev[currentQuestionIndex], audio: undefined }
        }));
    };

    const handleSubmitAnswer = async () => {
        if (isQuestionLocked || !sessionId || submittingRef.current) return;
        submittingRef.current = true;
        setIsSubmitting(true);
        const index = currentQuestionIndex;
        try {
            const recordedAudio = await stopRecording();
            const draft = drafts[index] || {};
            const code = draft.code || "";
            const answerText = draft.answerText?.trim() || "";
            const audio = recordedAudio || draft.audio;
            const diagram = draft.diagram;
            if ((currentQuestion?.questionType === "oral" && !audio?.size && !answerText) ||
                (currentQuestion?.questionType === "coding" && !code.trim()) ||
                (!code.trim() && !answerText && !audio?.size && !diagram?.size)) {
                toast.error("Please provide an answer before submitting.");
                return;
            }
            if (answerText && audio?.size) {
                toast.error("Choose a recorded or typed answer before submitting.");
                return;
            }
            let diagramImageUrl = "";
            if (diagram) {
                const data = new FormData();
                data.append("diagram", diagram, "diagram.png");
                const res = await api.post("/diagrams/upload", data, { timeout: 10000 });
                if (!res.data?.url) throw new Error("Diagram upload failed");
                diagramImageUrl = res.data.url;
            }
            const formData = new FormData();
            formData.append("questionIndex", index.toString());
            if (code) formData.append("code", code);
            if (answerText) formData.append("answerText", answerText);
            if (selectedLanguage) formData.append("language", selectedLanguage);
            if (audio) formData.append("audio", audio, audio.type.includes("mp4") ? "audio.m4a" : "audio.webm");
            if (diagramImageUrl) formData.append("diagramImageUrl", diagramImageUrl);
            setSubmittedLocal(prev => ({ ...prev, [index]: true }));
            await dispatch(submitAnswer({ sessionId, formData })).unwrap();
            if(durable)await dispatch(getSessionById(sessionId));
        } catch {
            setSubmittedLocal(prev => ({ ...prev, [index]: false }));
            toast.error("Answer upload failed. Your draft is preserved; please retry.");
        } finally {
            submittingRef.current = false;
            setIsSubmitting(false);
        }
    };

    const confirmFinishInterview = async () => {
        if (!sessionId) return;
        return dispatch(endSession(sessionId)).unwrap().then((result) => {
            const saved=(result as unknown as {session?:Session}).session || result;
            if(saved.status!=="completed"){
                toast.info("Lyra is preparing your saved report. You can reload this page safely.");return;
            }
            localStorage.removeItem(`draft_code_${sessionId}`);
            deleteDrafts(sessionId);
            navigate(`/review/${sessionId}`);
            toast.success("Interview ended successfully.");
        }).catch((error: unknown) => {
            toast.error("Failed to end interview. Please try again.");
            throw error;
        });
    };

    const handleOperation=async(id:string,action:"retry"|"cancel")=>{
        if(!sessionId)return;
        try{await api.post(`/sessions/${sessionId}/operations/${id}/${action}`);await dispatch(getSessionById(sessionId));}
        catch{toast.error("Unable to update processing. Refresh your saved progress and try again.");}
    };

    return {
        sessionId,
        activeSession,
        isLoading,
        isSubmitting,
        sessionMessage,
        sessionError,
        currentQuestionIndex,
        currentQuestion,
        selectedLanguage,
        setSelectedLanguage,
        drafts,
        isQuestionLocked,
        isProcessing,
        submittedLocal,
        handleNavigation,
        updateDraftCode,
        updateDraftAnswer,
        updateDraftAudio,
        updateDraftDiagram,
        deleteDraftAudio,
        handleSubmitAnswer,
        confirmFinishInterview,
        handleOperation,
        unfinished,
        socketConnection
    };
};
