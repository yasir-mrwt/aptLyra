import { Link } from "react-router-dom";
import { useState } from "react";
import { useAudioRecorder } from "../hooks/useAudioRecorder";
import { useInterviewSession } from "../hooks/useInterviewSession";
import { useInterviewerVoice } from "../hooks/useInterviewerVoice";

import ConfirmModal from "../components/ConfirmModal";
import InterviewHeader from "../components/InterviewHeader";
import QuestionSection from "../components/QuestionSection";
import InterviewerPanel from "../components/InterviewerPanel";
import VerbalRecorder from "../components/VerbalRecorder";
import CodeEditorSection from "../components/CodeEditorSection";
import CodeOutputPanel from "../components/CodeOutputPanel";
import RubricFeedback from "../components/RubricFeedback";
import AIFeedbackSection from "../components/AIFeedbackSection";
import InterviewLoading from "../components/InterviewLoading";
import WhiteboardModal from "../components/WhiteboardModal";

const InterviewRunner = () => {
    const [isFinishModalOpen, setIsFinishModalOpen] = useState(false);
    const [isWhiteboardOpen, setIsWhiteboardOpen] = useState(false);
    const [isFinishing, setIsFinishing] = useState(false);

    const {
        isRecording,
        isStarting,
        recordingError,
        recordingTime,
        startRecording,
        stopRecording,
        setRecordingTime
    } = useAudioRecorder();


    const {
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
        confirmFinishInterview
    } = useInterviewSession(stopRecording, setRecordingTime);

    // AI interviewer voice (Groq TTS + live lip-sync amplitude)
    const {
        isSpeaking,
        isPreparing,
        voiceError,
        usingBrowserVoice,
        isMuted,
        amplitude,
        speak,
        toggleMute,
    } = useInterviewerVoice(
        activeSession?._id,
        currentQuestionIndex,
        currentQuestion?.questionText,
        activeSession?.status === "in-progress" && !currentQuestion?.evidenceUnavailable && !isRecording && !isStarting && !isProcessing
    );

    const handleConfirmFinish = async () => {
        if (isFinishing) return;
        setIsFinishing(true);
        setIsFinishModalOpen(false);
        try {

            await confirmFinishInterview();
        } catch (error) {
            console.error("Failed to finish interview:", error);
            setIsFinishing(false);
            alert("Failed to finalize session. Please try again or refresh.");
        }
    };

    if (activeSession?.status === "failed" || activeSession?.status === "cancelled") {
        return <div role="alert" className="max-w-xl mx-auto p-6 text-white">
            <p>This interview could not start. Please retry by creating a new session.</p>
            <Link className="btn-primary inline-block mt-4" to="/dashboard">Return to interview setup</Link>
        </div>;
    }

    if (!activeSession || !activeSession.questions || activeSession.questions.length === 0 || isFinishing) {
        return <InterviewLoading sessionMessage={isFinishing ? "Finalizing Interview..." : sessionMessage} />;
    }

    const currentDraft = drafts[currentQuestionIndex] || {};
    const isCodingQuestion = currentQuestion?.questionType === 'coding';
    if(currentQuestion?.evidenceUnavailable)return <div role="alert" className="p-6"><p>{currentQuestion.questionText}</p><Link to="/dashboard">Create a fresh plan</Link></div>;

    return (
        <div className="max-w-7xl mx-auto px-4 pb-32">
            {activeSession.planId && <p className="mb-4">{activeSession.scoringVersion === "rubric-v1" ? "Rubric evaluation · Reviewed scores require approved scoring material; other results are provisional or abstained." : "Planner-backed questions · Legacy evaluation"}</p>}
            <InterviewHeader
                role={activeSession.role}
                startTime={activeSession.createdAt || activeSession.updatedAt || new Date().toISOString()}
                questions={activeSession.questions}
                currentQuestionIndex={currentQuestionIndex}
                submittedLocal={submittedLocal}
                handleNavigation={(index) => { if (!isStarting) void handleNavigation(index); }}
                handleFinishInterview={() => setIsFinishModalOpen(true)}
                isLoading={isLoading || isSubmitting}
                finishDisabled={activeSession.status !== "in-progress" || isStarting || isRecording || isSubmitting || activeSession.questions.some(q => (q.isSubmitted && !q.isEvaluated) || q.followUpPending)}
                questionsCount={activeSession.questions.length}
                company={activeSession.company}
            />

            {/* The interviewer sits across from you — avatar + question side by side */}
            <div className="flex flex-col md:flex-row gap-6 items-stretch mb-10">
                <InterviewerPanel
                    speaking={isSpeaking}
                    listening={isRecording}
                    processing={isProcessing}
                    preparing={isPreparing || isStarting}
                    completed={activeSession.status === "completed"}
                    error={currentQuestion?.processingError || (sessionError ? sessionMessage : null) || recordingError || voiceError}
                    usingBrowserVoice={usingBrowserVoice}
                    amplitude={amplitude}
                    muted={isMuted}
                    onToggleMute={toggleMute}
                    onReplay={speak}
                />
                <div className="flex-1 min-w-0">
                    <QuestionSection
                        index={currentQuestionIndex}
                        text={currentQuestion?.questionText || ""}
                        followUpOf={currentQuestion?.followUpOf}
                    />
                </div>
            </div>

            {currentQuestion?.speechMetricsStatus === "unavailable" && (
                <p role="status" className="mb-4 text-sm text-surface-300">Speech metrics unavailable. Feedback uses your transcript; no pace or pause measurements were saved.</p>
            )}
            {isCodingQuestion ? (
                <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
                    <CodeEditorSection
                        language={selectedLanguage}
                        plannedLanguage={!!activeSession.planId}
                        code={currentDraft.code || ""}
                        isQuestionLocked={isQuestionLocked}
                        setLanguage={setSelectedLanguage}
                        updateCode={updateDraftCode}
                    />
                    <CodeOutputPanel
                        context={activeSession.scoringVersion === "rubric-v1" ? {sessionId:activeSession._id,questionIndex:currentQuestionIndex}:undefined}
                        language={selectedLanguage}
                        code={currentDraft.code || ""}
                    />
                </div>
            ) : (
                <div className="grid gap-6 grid-cols-1">
                    <VerbalRecorder
                        isRecording={isRecording}
                        recordingTime={recordingTime}
                        hasAudio={!!currentDraft.audio}
                        isQuestionLocked={isQuestionLocked || isStarting || !!currentDraft.answerText?.trim()}
                        startRecording={() => startRecording(updateDraftAudio)}
                        stopRecording={stopRecording}
                        deleteDraftAudio={deleteDraftAudio}
                    />
                    <div className="glass-card p-6 rounded-2xl">
                        <label htmlFor="typed-answer" className="block mb-2 font-semibold">Type an answer instead</label>
                        <textarea
                            id="typed-answer"
                            value={currentDraft.answerText || ""}
                            onChange={event => updateDraftAnswer(event.target.value)}
                            disabled={isQuestionLocked || isRecording || isStarting || !!currentDraft.audio?.size}
                            maxLength={50000}
                            rows={5}
                            className="w-full p-3 rounded-xl bg-surface-800 text-white disabled:opacity-50"
                            aria-describedby="typed-answer-help"
                        />
                        <p id="typed-answer-help" className="mt-2 text-sm text-surface-300">Use a recording or a typed answer. Clear your text to record, or remove the recording to type.</p>
                    </div>
                    {currentQuestion?.questionType === 'system-design' && (
                        <div className="flex justify-center mt-2">
                            <button
                                onClick={() => setIsWhiteboardOpen(true)}
                                disabled={isQuestionLocked}
                                className="px-6 py-3 rounded-xl bg-surface-800 border border-white/10 hover:border-primary-500 text-sm font-black uppercase tracking-widest text-white transition-all hover:bg-surface-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
                            >
                                <svg className="w-5 h-5 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                                {currentDraft.diagram ? 'Edit Whiteboard Diagram' : 'Open System Design Whiteboard'}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {isWhiteboardOpen && (
                <WhiteboardModal
                    initialElements={currentDraft.diagramElements}
                    onClose={() => setIsWhiteboardOpen(false)}
                    onSubmit={(blob, elements) => {
                        updateDraftDiagram(blob, elements);
                        setIsWhiteboardOpen(false);
                    }}
                />
            )}

            {currentQuestion?.evaluation ? <RubricFeedback evaluation={currentQuestion.evaluation} /> : <AIFeedbackSection
                isEvaluated={!!currentQuestion?.isEvaluated}
                feedback={currentQuestion?.aiFeedback || ""}
                score={currentQuestion?.technicalScore || 0}
                speechMetrics={currentQuestion?.speechMetrics}
            />}

            <div className="fixed bottom-0 left-0 right-0 glass-card border-x-0 border-b-0 p-5 px-6 md:px-12 flex justify-between items-center z-50">
                <button
                    onClick={() => handleNavigation(currentQuestionIndex - 1)}
                    disabled={isStarting || isSubmitting || currentQuestionIndex === 0}
                    className="text-surface-500 font-black text-[10px] uppercase tracking-widest hover:text-white disabled:opacity-20 cursor-pointer transition-colors"
                >
                    ← Back
                </button>

                <div className="flex flex-col items-center">
                    {isProcessing && sessionMessage && (
                        <div className="absolute -top-12 left-1/2 -translate-x-1/2 text-[10px] font-black uppercase tracking-widest text-primary-400 bg-primary-500/10 px-4 py-2 rounded-full animate-pulse border border-primary-500/20 backdrop-blur-md">
                            {sessionMessage}...
                        </div>
                    )}

                    <button
                        onClick={handleSubmitAnswer}
                        disabled={isQuestionLocked || isStarting}
                        className={`px-10 py-3 rounded-2xl font-black text-[11px] uppercase tracking-widest text-white shadow-xl transition-all active:scale-[0.98] ${isProcessing ? 'bg-surface-800 cursor-wait' : currentQuestion?.isEvaluated ? 'bg-emerald-600 shadow-emerald-900/20' : isQuestionLocked ? 'bg-surface-800' : 'bg-primary-600 hover:bg-primary-500 shadow-primary-900/20 cursor-pointer'}`}
                    >
                        {isProcessing ? 'Analyzing...' : currentQuestion?.isEvaluated ? 'Submitted' : isQuestionLocked ? 'Locked' : currentQuestion?.processingError ? 'Retry Answer' : 'Commit Answer'}
                    </button>
                </div>

                <button
                    onClick={() => handleNavigation(currentQuestionIndex + 1)}
                    disabled={isStarting || isSubmitting || currentQuestionIndex === (activeSession?.questions?.length || 0) - 1}
                    className="text-surface-500 font-black text-[10px] uppercase tracking-widest hover:text-white disabled:opacity-20 cursor-pointer transition-colors"
                >
                    Next →
                </button>
            </div>

            <ConfirmModal
                isOpen={isFinishModalOpen}
                title="Finish Interview?"
                message="Are you sure you want to end this interview session? You won't be able to change your answers after this."
                confirmText="Finish"
                cancelText="Keep Going"
                onConfirm={handleConfirmFinish}
                onCancel={() => setIsFinishModalOpen(false)}
                isDanger={false}
            />
        </div>
    );
};

export default InterviewRunner;
