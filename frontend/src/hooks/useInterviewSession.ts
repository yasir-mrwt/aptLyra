import { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import type { AppDispatch, RootState } from "../app/store";
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
export const useInterviewSession = (stopRecording: () => void, setRecordingTime: (time: number) => void) => {
    const { sessionId } = useParams<{ sessionId: string }>();
    const navigate = useNavigate();
    const dispatch = useDispatch<AppDispatch>();
    const { activeSession, isLoading, isError: sessionError, message: sessionMessage } = useSelector((state: RootState) => state.session);

    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    // Derive selected language securely without side-effects (React paradigm)
    const [languageOverride, setLanguageOverride] = useState<string | null>(null);
    const defaultLang = activeSession?.role ? ROLE_LANGUAGE_MAP[activeSession.role] || "plaintext" : "javascript";
    const selectedLanguage = languageOverride ?? defaultLang;
    const setSelectedLanguage = setLanguageOverride;

    const [submittedLocal, setSubmittedLocal] = useState<Record<number, boolean>>({});

    // Initial drafts state from IDB with empty fallback
    const [drafts, setDrafts] = useState<Record<number, { code?: string; audio?: Blob; diagram?: Blob; diagramElements?: readonly unknown[] }>>({});

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
    const isReduxSubmitted = currentQuestion?.isSubmitted === true;
    const isLocallySubmitted = submittedLocal[currentQuestionIndex] === true;
    const isEvaluationError = sessionError && sessionMessage.includes("Failed");

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

    const isQuestionLocked = isReduxSubmitted || (isLocallySubmitted && !isEvaluationError);
    const isProcessing = isQuestionLocked && !currentQuestion?.isEvaluated;

    const handleNavigation = (index: number) => {
        if (activeSession?.questions && index >= 0 && index < activeSession.questions.length) {
            stopRecording();
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
        if (isQuestionLocked || !sessionId) return;
        stopRecording();

        const draft = drafts[currentQuestionIndex] || {};
        const code = draft.code || "";
        const audio = draft.audio || null;
        const diagram = draft.diagram || null;

        if (!code && !audio && !diagram) {
            toast.error("Please provide an answer before submitting.");
            return;
        }

        setSubmittedLocal(prev => ({
            ...prev, [currentQuestionIndex]: true
        }));

        let diagramImageUrl = "";
        if (diagram) {
            try {
                const diagFormData = new FormData();
                diagFormData.append("diagram", diagram, "diagram.png");

                const res = await api.post(`/diagrams/upload`, diagFormData, {
                    timeout: 10000,
                });

                if (res.data && res.data.url) {
                    diagramImageUrl = res.data.url;
                }
            } catch (err) {
                console.error("Failed to upload diagram", err);
                toast.warning("Failed to upload whiteboard diagram. Submitting without it.");
            }
        }

        const formData = new FormData();
        formData.append("questionIndex", currentQuestionIndex.toString());
        if (code) formData.append("code", code);
        if (selectedLanguage) formData.append("language", selectedLanguage);
        if (audio) formData.append("audio", audio, 'audio.webm');
        if (diagramImageUrl) formData.append("diagramImageUrl", diagramImageUrl);

        dispatch(submitAnswer({ sessionId, formData })).unwrap().catch(() => {
            setSubmittedLocal(prev => ({
                ...prev, [currentQuestionIndex]: false
            }));
            toast.error("Failed to submit answer. Please try again.");
        });
    };

    const confirmFinishInterview = async () => {
        if (!sessionId) return;
        return dispatch(endSession(sessionId)).unwrap().then(() => {
            localStorage.removeItem(`draft_code_${sessionId}`);
            deleteDrafts(sessionId);
            navigate(`/review/${sessionId}`);
            toast.success("Interview ended successfully.");
        }).catch(() => {
            toast.error("Failed to end interview. Please try again.");
        });
    };

    return {
        sessionId,
        activeSession,
        isLoading,
        sessionMessage,
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
        updateDraftAudio,
        updateDraftDiagram,
        deleteDraftAudio,
        handleSubmitAnswer,
        confirmFinishInterview
    };
};
