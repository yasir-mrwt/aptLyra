import { Link, useParams } from "react-router-dom";
import { useState, useRef, useEffect } from "react";
import { useAudioRecorder } from "../hooks/useAudioRecorder";
import { useInterviewSession } from "../hooks/useInterviewSession";
import { useInterviewerVoice } from "../hooks/useInterviewerVoice";

import api from "../services/apiClient";
import {useDispatch} from "react-redux";
import type {AppDispatch} from "../app/store";
import {getSessionById} from "../features/session/sessionSlice";
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
import OperationStatusPanel from "../components/OperationStatusPanel";

const InterviewRunnerSession = () => {
    const dispatch=useDispatch<AppDispatch>();
    const [editorReady,setEditorReady]=useState(false);
    const [activationError,setActivationError]=useState(false);
    const [activationAttempt,setActivationAttempt]=useState(0);
    const [isFinishModalOpen, setIsFinishModalOpen] = useState(false);
    const [isWhiteboardOpen, setIsWhiteboardOpen] = useState(false);
    const [isFinishing, setIsFinishing] = useState(false);
    const finishInFlight=useRef(false);

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
        isSubmitting, isTranscribing, transcribeDraft,
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
        unfinished,socketConnection
    } = useInterviewSession(stopRecording, setRecordingTime);

    useEffect(()=>{
        if(!activeSession?.activationRequired || !currentQuestion || (currentQuestion.questionType==="coding"&&!editorReady))return;
        let cancelled=false;
        const frame=requestAnimationFrame(()=>{
            performance.mark("aptlyra-interview-workspace-ready");
            void api.post(`/sessions/${activeSession._id}/activate`,{}, {timeout:15000})
              .then(()=>{if(!cancelled)void dispatch(getSessionById(activeSession._id));})
              .catch(()=>{if(!cancelled)setActivationError(true);});
        });
        return()=>{cancelled=true;cancelAnimationFrame(frame);};
    },[activeSession?._id,activeSession?.activationRequired,currentQuestion,editorReady,activationAttempt,dispatch]);

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
        !activeSession?.activationRequired && activeSession?.status === "in-progress" && activeSession.runtimeState!=="finishing" && !currentQuestion?.evidenceUnavailable && !isRecording && !isStarting && !isProcessing
    );

    const handleConfirmFinish = async () => {
        if (finishInFlight.current) return;
        finishInFlight.current=true;
        setIsFinishing(true);
        setIsFinishModalOpen(false);
        try {

            await confirmFinishInterview();
            setIsFinishing(false);
            finishInFlight.current=false;
        } catch (error) {
            console.error("Failed to finish interview:", error);
            setIsFinishing(false);
            finishInFlight.current=false;
            alert("Failed to finalize session. Please try again or refresh.");
        }
    };

    if(!activeSession && sessionError)return <div className="p-6"><p role="alert">{sessionMessage}</p><Link to="/dashboard">Return to interview setup</Link></div>;
    if (activeSession?.status === "failed" || activeSession?.status === "cancelled") {
        return <div role="alert" className="max-w-xl mx-auto p-6 text-white">
            <p>This interview could not start. Please retry by creating a new session.</p>
            <Link className="btn-primary inline-block mt-4" to="/dashboard">Return to interview setup</Link>
        </div>;
    }

    if (!activeSession || !activeSession.questions || activeSession.questions.length === 0 || isFinishing) {
        return <InterviewLoading sessionMessage={(isFinishing || activeSession?.runtimeState==="finishing") ? "Finishing… Your answers are saved. Preparing your report." : sessionMessage} />;
    }

    const unanswered = activeSession.questions.filter(q => !q.answerLocked && !q.operationId && !q.isSubmitted && !q.isEvaluated).length;
    const currentDraft = drafts[currentQuestionIndex] || {};
    const isCodingQuestion = currentQuestion?.questionType === 'coding';
    if(currentQuestion?.evidenceUnavailable)return <div role="alert" className="p-6"><p>{currentQuestion.questionText}</p><Link to="/dashboard">Create a fresh plan</Link></div>;

    return (
        <div className="max-w-7xl mx-auto px-4 pb-32">
            {activeSession.planId && <p className="mb-4">{activeSession.scoringVersion === "rubric-v1" ? "Trusted starters use established interview evaluation. Dynamic questions show their own rubric readiness." : "Planner-backed questions · Legacy evaluation"}</p>}
            {activeSession.activationRequired&&<div role="status" className="p-4 border rounded-xl">{activationError?<>Unable to start the clock. Your plan is saved. <button onClick={()=>{setActivationError(false);setActivationAttempt(n=>n+1);}}>Retry activation</button></>:"Preparing your interview… The clock starts when your workspace is ready."}</div>}
            <OperationStatusPanel session={activeSession} onAction={handleOperation} connection={socketConnection} />
            {activeSession.runtimeState==="finishing"&&<p role="status" aria-live="polite" className="mb-4">Finishing… Your answers are saved. Preparing your report; you can safely reload.</p>}
            <InterviewHeader
                endTime={activeSession.endTime?new Date(activeSession.endTime).toISOString():undefined}
                role={activeSession.role}
                startTime={activeSession.activationRequired?undefined:activeSession.activatedAt || (activeSession.startTime?String(activeSession.startTime):undefined)}
                questions={activeSession.questions}
                currentQuestionIndex={currentQuestionIndex}
                submittedLocal={submittedLocal}
                handleNavigation={(index) => { if (!isStarting && !isTranscribing && !isRecording) void handleNavigation(index); }}
                handleFinishInterview={() => setIsFinishModalOpen(true)}
                isLoading={isLoading || isSubmitting}
                finishDisabled={!!activeSession.activationRequired || activeSession.status !== "in-progress" || activeSession.runtimeState==="finishing" || !!unfinished || isStarting || isRecording || isTranscribing || isSubmitting || activeSession.questions.some(q => (q.isSubmitted && !q.isEvaluated) || q.followUpPending)}
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
                    error={(currentQuestion?.processingError ? activeSession.runtimeVersion ? "Saved processing needs your attention. Use the controls above to retry or continue." : currentQuestion.processingError : null) || (sessionError ? sessionMessage : null) || recordingError || voiceError}
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
                    <CodeEditorSection onReady={()=>setEditorReady(true)}
                        language={selectedLanguage}
                        plannedLanguage={!!activeSession.planId}
                        code={currentQuestion?.answerLocked || currentQuestion?.isSubmitted || currentQuestion?.isEvaluated ? currentQuestion.userSubmittedCode ?? currentDraft.code ?? "" : currentDraft.code ?? ""}
                        isQuestionLocked={isQuestionLocked}
                        setLanguage={setSelectedLanguage}
                        updateCode={updateDraftCode}
                    />
                    <CodeOutputPanel
                        context={activeSession.scoringVersion === "rubric-v1" ? {sessionId:activeSession._id,questionIndex:currentQuestionIndex}:undefined}
                        language={selectedLanguage}
                        code={currentQuestion?.answerLocked || currentQuestion?.isSubmitted || currentQuestion?.isEvaluated ? currentQuestion.userSubmittedCode ?? currentDraft.code ?? "" : currentDraft.code ?? ""}
                        executionTestId={currentQuestion?.executionTestId}
                    />
                    <div className="lg:col-span-2 glass-card p-5"><label htmlFor="coding-explanation" className="block font-semibold mb-2">Explain your approach</label><textarea id="coding-explanation" value={currentDraft.answerText ?? currentQuestion?.userAnswerText ?? ""} onChange={event=>updateDraftAnswer(event.target.value)} disabled={isQuestionLocked} maxLength={50000} rows={5} className="w-full rounded bg-surface-800 p-3" aria-describedby="coding-explanation-help"/><p id="coding-explanation-help" className="text-sm mt-2">Describe your approach, time and space complexity, and tradeoffs. Saved separately from your code and included with your submitted answer.</p></div>
                </div>
            ) : (
                <div className="grid gap-6 grid-cols-1">
                    <VerbalRecorder
                        isRecording={isRecording}
                        recordingTime={recordingTime}
                        hasAudio={!!currentDraft.audio}
                        isQuestionLocked={isQuestionLocked || isStarting || isTranscribing}
                        startRecording={() => {updateDraftAnswer("");deleteDraftAudio();void startRecording(updateDraftAudio);}}
                        stopRecording={()=>void transcribeDraft()}
                        deleteDraftAudio={deleteDraftAudio}
                    />
                    <div className="glass-card p-6 rounded-2xl">
                        {isTranscribing&&<p role="status">Transcribing your draft… Nothing has been submitted.</p>}
                        {!!currentDraft.audio?.size&&!isRecording&&<button disabled={isQuestionLocked||isTranscribing} onClick={()=>void transcribeDraft()} className="btn-primary">Transcribe recording</button>}
                        <label htmlFor="typed-answer" className="block mb-2 font-semibold">Review your transcript or type an answer</label>
                        <textarea
                            id="typed-answer"
                            value={currentQuestion?.answerLocked || currentQuestion?.operationId || currentQuestion?.isSubmitted || currentQuestion?.isEvaluated ? currentQuestion.userAnswerText ?? currentDraft.answerText ?? "" : currentDraft.answerText ?? ""}
                            onChange={event => updateDraftAnswer(event.target.value)}
                            disabled={isQuestionLocked || isRecording || isStarting || isTranscribing || !!currentDraft.audio?.size}
                            maxLength={50000}
                            rows={5}
                            className="w-full p-3 rounded-xl bg-surface-800 text-white disabled:opacity-50"
                            aria-describedby="typed-answer-help"
                        />
                        <p id="typed-answer-help" className="mt-2 text-sm text-surface-300">Edit this text before confirming. Only the text you confirm is evaluated. Record again to replace this draft.</p>
                        <button type="button" disabled={isQuestionLocked||isTranscribing||isRecording} onClick={()=>{updateDraftAnswer("");deleteDraftAudio();}} className="mt-3 underline">Cancel draft</button>
                    </div>
                    {currentQuestion?.questionType === 'system-design' && <details className="glass-card p-4"><summary>Optional code workspace · execution does not verify the design</summary><div className="grid gap-4 mt-4 lg:grid-cols-2"><CodeEditorSection language={selectedLanguage} plannedLanguage code={currentDraft.code??currentQuestion.userSubmittedCode??""} isQuestionLocked={isQuestionLocked} setLanguage={setSelectedLanguage} updateCode={updateDraftCode}/><CodeOutputPanel context={{sessionId:activeSession._id,questionIndex:currentQuestionIndex}} language={selectedLanguage} code={currentDraft.code??currentQuestion.userSubmittedCode??""}/></div></details>}
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
                    disabled={isStarting || isSubmitting || isTranscribing || isRecording || currentQuestionIndex === 0}
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
                        disabled={isQuestionLocked || isStarting || isRecording || isTranscribing || !!currentDraft.audio?.size}
                        className={`px-10 py-3 rounded-2xl font-black text-[11px] uppercase tracking-widest text-white shadow-xl transition-all active:scale-[0.98] ${isProcessing ? 'bg-surface-800 cursor-wait' : currentQuestion?.isEvaluated ? 'bg-emerald-600 shadow-emerald-900/20' : isQuestionLocked ? 'bg-surface-800' : 'bg-primary-600 hover:bg-primary-500 shadow-primary-900/20 cursor-pointer'}`}
                    >
                        {isProcessing ? 'Analyzing...' : currentQuestion?.isEvaluated ? 'Submitted' : isQuestionLocked ? 'Locked' : currentQuestion?.processingError ? 'Retry Answer' : 'Confirm and submit'}
                    </button>
                </div>

                <button
                    onClick={() => handleNavigation(currentQuestionIndex + 1)}
                    disabled={isStarting || isSubmitting || isTranscribing || isRecording || currentQuestionIndex === (activeSession?.questions?.length || 0) - 1}
                    className="text-surface-500 font-black text-[10px] uppercase tracking-widest hover:text-white disabled:opacity-20 cursor-pointer transition-colors"
                >
                    {currentQuestion?.answerLocked || currentQuestion?.operationId || currentQuestion?.isSubmitted || currentQuestion?.isEvaluated ? "Next →" : "Skip for now →"}
                </button>
            </div>

            <ConfirmModal
                isOpen={isFinishModalOpen}
                title="Finish Interview?"
                message={unanswered ? `${unanswered} of ${activeSession.questions.length} questions remain unanswered. Unsent drafts will not be evaluated. You can review them before finishing.` : "All answers have been submitted. Finish to prepare your report."}
                confirmText={unanswered ? "Finish without answering" : "Finish"}
                cancelText={unanswered ? "Review unanswered" : "Keep going"}
                onConfirm={handleConfirmFinish}
                onCancel={() => { setIsFinishModalOpen(false); if (unanswered) void handleNavigation(activeSession.questions.findIndex(q => !q.answerLocked && !q.operationId && !q.isSubmitted && !q.isEvaluated)); }}
                isDanger={false}
            />
        </div>
    );
};

// Route changes must reset drafts, recording, question index and voice together.
export default function InterviewRunner() {
    const {sessionId} = useParams<{sessionId:string}>();
    return <InterviewRunnerSession key={sessionId}/>;
}
