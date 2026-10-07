import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import type { Session } from "../types/session";
import { useAudioRecorder } from "./useAudioRecorder";
import { useInterviewerVoice } from "./useInterviewerVoice";
import { useInterviewSession } from "./useInterviewSession";
import InterviewerPanel from "../components/InterviewerPanel";
import sessionReducer, { setActiveSession, createSession } from "../features/session/sessionSlice";
import api from "../services/api";
import apiClient from "../services/apiClient";

vi.mock("../services/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("../services/apiClient", () => ({ default: { post: vi.fn() } }));
vi.mock("../utils/idb", () => ({ getDrafts: vi.fn().mockResolvedValue({}), saveDrafts: vi.fn(), deleteDrafts: vi.fn() }));
vi.mock("react-toastify", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

class RecorderFixture {
    static latest: RecorderFixture;
    state = "inactive";
    mimeType = "audio/webm";
    ondataavailable: ((event: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    constructor() { RecorderFixture.latest = this; }
    start() { this.state = "recording"; }
    stop() {
        this.state = "inactive";
        queueMicrotask(() => { this.ondataavailable?.({ data: new Blob(["final audio"]) }); this.onstop?.(); });
    }
}

describe("recorder baseline", () => {
    it("awaits final audio and prevents duplicate starts", async () => {
        const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] });
        Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
        vi.stubGlobal("MediaRecorder", RecorderFixture);
        const onStop = vi.fn();
        const { result } = renderHook(() => useAudioRecorder());
        await act(async () => { await Promise.all([result.current.startRecording(onStop), result.current.startRecording(onStop)]); });
        expect(getUserMedia).toHaveBeenCalledTimes(1);
        expect(result.current.isRecording).toBe(true);
        let blob: Blob | null = null;
        await act(async () => { blob = await result.current.stopRecording(); });
        expect(blob!.size).toBe(11);
        expect(onStop).toHaveBeenCalledTimes(1);
        expect(result.current.isRecording).toBe(false);
        expect(await result.current.stopRecording()).toBeNull();
    });
    it("shows permission failure and permits another attempt", async () => {
        const getUserMedia = vi.fn().mockRejectedValue(new Error("Permission denied"));
        Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
        const { result } = renderHook(() => useAudioRecorder());
        await act(() => result.current.startRecording(vi.fn()));
        expect(result.current.recordingError).toContain("Microphone unavailable");
        expect(result.current.isStarting).toBe(false);
        await act(() => result.current.startRecording(vi.fn()));
        expect(getUserMedia).toHaveBeenCalledTimes(2);
    });
});

class AudioContextFixture { state = "running"; close() { return Promise.resolve(); } }
class UtteranceFixture {
    onstart: (() => void) | null = null;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
}

describe("Lyra voice baseline", () => {
    it("autoplay suspension cannot block the server request or browser fallback", async () => {
        const resume = vi.fn(() => new Promise<void>(() => {}));
        class SuspendedContext { state = "suspended"; resume = resume; close() { return Promise.resolve(); } }
        vi.stubGlobal("AudioContext", SuspendedContext);
        vi.stubGlobal("SpeechSynthesisUtterance", UtteranceFixture);
        const speech = { getVoices: () => [], cancel: vi.fn(), speak: vi.fn() };
        vi.stubGlobal("speechSynthesis", speech);
        vi.mocked(apiClient.post).mockRejectedValue({ isAxiosError: true, response: { status: 503 } });
        const { result } = renderHook(() => useInterviewerVoice("session", 0, "Question"));
        await waitFor(() => expect(speech.speak).toHaveBeenCalledTimes(1));
        expect(apiClient.post).toHaveBeenCalledTimes(1);expect(resume).not.toHaveBeenCalled();
        expect(result.current.isPreparing).toBe(false);
    });
    it("plays valid server audio and replays the cached question without another request", async () => {
        const start = vi.fn(), stop = vi.fn(), decode = vi.fn().mockResolvedValue({ duration: 1 });
        class WorkingContext {
            state = "running"; destination = {};
            decodeAudioData = decode;
            createBufferSource() { return { connect: vi.fn(), start, stop, buffer: null, onended: null }; }
            createAnalyser() { return { connect: vi.fn(), fftSize: 0, frequencyBinCount: 2, getByteTimeDomainData: vi.fn() }; }
            close() { return Promise.resolve(); }
        }
        vi.stubGlobal("AudioContext", WorkingContext);
        vi.stubGlobal("requestAnimationFrame", vi.fn().mockReturnValue(1));
        vi.stubGlobal("cancelAnimationFrame", vi.fn());
        vi.mocked(apiClient.post).mockResolvedValue({ data: new ArrayBuffer(44) });
        const { result, rerender } = renderHook(({ enabled }) => useInterviewerVoice("session", 0, "Question", enabled), { initialProps: { enabled: true } });
        await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
        expect(result.current.usingBrowserVoice).toBe(false);
        await act(async () => result.current.speak());
        expect(start).toHaveBeenCalledTimes(2);expect(apiClient.post).toHaveBeenCalledTimes(1);expect(decode).toHaveBeenCalledTimes(1);
        rerender({ enabled: false });
        await waitFor(() => expect(result.current.isSpeaking).toBe(false));
        expect(stop).toHaveBeenCalled();
    });
    it("shares pending server requests, falls back once, and uses browser voice for later automatic questions", async () => {
        vi.stubGlobal("AudioContext", AudioContextFixture);
        vi.stubGlobal("SpeechSynthesisUtterance", UtteranceFixture);
        const speech = { getVoices: () => [], cancel: vi.fn(), speak: vi.fn((u: UtteranceFixture) => u.onstart?.()) };
        vi.stubGlobal("speechSynthesis", speech);
        let reject: (error: unknown) => void = () => {};
        vi.mocked(apiClient.post).mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
        const { result, rerender } = renderHook(({ index }) => useInterviewerVoice("session", index, "Question"), { initialProps: { index: 0 } });
        await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(1));
        act(() => { result.current.speak(); result.current.speak(); });
        expect(apiClient.post).toHaveBeenCalledTimes(1);
        await act(async () => { reject({ isAxiosError: true, response: { status: 503 } }); });
        await waitFor(() => expect(result.current.usingBrowserVoice).toBe(true));
        expect(speech.speak).toHaveBeenCalledTimes(1);
        rerender({ index: 1 });
        await waitFor(() => expect(speech.speak).toHaveBeenCalledTimes(2));
        expect(apiClient.post).toHaveBeenCalledTimes(1);
        act(() => result.current.speak()); // One explicit server retry is allowed.
        expect(apiClient.post).toHaveBeenCalledTimes(2);
        await act(async () => { reject({ isAxiosError: true, response: { status: 503 } }); });
    });
    it("does not use stale private question text as browser fallback after a state/ownership denial", async () => {
        vi.stubGlobal("AudioContext", AudioContextFixture);
        vi.stubGlobal("SpeechSynthesisUtterance", UtteranceFixture);
        const speech = { getVoices: () => [], cancel: vi.fn(), speak: vi.fn() };
        vi.stubGlobal("speechSynthesis", speech);
        vi.mocked(apiClient.post).mockRejectedValue({ isAxiosError: true, response: { status: 409 } });
        const { result } = renderHook(() => useInterviewerVoice("session", 0, "Question"));
        await waitFor(() => expect(result.current.voiceError).toContain("Refresh"));
        expect(speech.speak).not.toHaveBeenCalled();
    });
    it("falls back to browser voice, persists mute, and stops while disabled", async () => {
        vi.stubGlobal("AudioContext", AudioContextFixture);
        vi.stubGlobal("SpeechSynthesisUtterance", UtteranceFixture);
        const speech = { getVoices: () => [], cancel: vi.fn(), speak: vi.fn((u: UtteranceFixture) => u.onstart?.()) };
        vi.stubGlobal("speechSynthesis", speech);
        vi.mocked(apiClient.post).mockRejectedValue(new Error("TTS unavailable"));
        const { result, rerender } = renderHook(({ enabled }) => useInterviewerVoice("session", 0, "Question", enabled), { initialProps: { enabled: true } });
        await waitFor(() => expect(result.current.isSpeaking).toBe(true));
        expect(result.current.usingBrowserVoice).toBe(true);
        act(() => result.current.toggleMute());
        expect(result.current.isSpeaking).toBe(false);
        expect(localStorage.getItem("preptalk_interviewer_muted")).toBe("true");
        act(() => result.current.toggleMute());
        await waitFor(() => expect(result.current.isSpeaking).toBe(true));
        rerender({ enabled: false });
        await waitFor(() => expect(result.current.isSpeaking).toBe(false));
        const count = speech.speak.mock.calls.length;
        act(() => result.current.speak());
        expect(speech.speak).toHaveBeenCalledTimes(count);
    });
    it("reports unavailable voice and never starts audio in completed/disabled state", async () => {
        vi.stubGlobal("AudioContext", undefined);
        vi.stubGlobal("speechSynthesis", undefined);
        const { result, rerender } = renderHook(({ enabled }) => useInterviewerVoice("session", 0, "Question", enabled), { initialProps: { enabled: false } });
        act(() => result.current.speak());
        expect(result.current.voiceError).toBeNull();
        rerender({ enabled: true });
        await waitFor(() => expect(result.current.voiceError).toContain("Voice unavailable"));
        expect(result.current.isSpeaking).toBe(false);
    });
    it("labels listening only during recording and disables replay for completed sessions", () => {
        const props = { speaking: false, amplitude: 0, muted: false, onReplay: vi.fn(), onToggleMute: vi.fn() };
        const { rerender } = render(<InterviewerPanel {...props} />);
        expect(screen.getByRole("status").textContent).toBe("Ready");
        rerender(<InterviewerPanel {...props} listening />);
        expect(screen.getByRole("status").textContent).toBe("Listening");
        rerender(<InterviewerPanel {...props} completed />);
        expect(screen.getByRole("status").textContent).toBe("Completed");
        expect((screen.getByTitle("Repeat the question") as HTMLButtonElement).disabled).toBe(true);
        rerender(<InterviewerPanel {...props} error="Speech failed; retry" />);
        expect(screen.getByRole("alert").textContent).toContain("retry");
    });
});

function interviewFixture() {
    const session: Session = { _id: "session", user: "owner", role: "Backend", level: "Junior", interviewType: "oral-only", status: "in-progress", questions: [{ questionText: "Q", questionType: "oral", isSubmitted: false, isEvaluated: false }] };
    vi.mocked(api.get).mockResolvedValue({ data: { session } });
    const store = configureStore({ reducer: { session: sessionReducer } });
    store.dispatch(setActiveSession(session));
    const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}><MemoryRouter initialEntries={["/interview/session"]}><Routes><Route path="/interview/:sessionId" element={children} /></Routes></MemoryRouter></Provider>;
    return { session, store, wrapper };
}

describe("answer controls", () => {
    it("submits a typed oral draft without audio, preserves it for retry, and navigates after evaluation", async () => {
        const { session: initial, store, wrapper } = interviewFixture();
        const session = { ...initial, questions: [...initial.questions, { ...initial.questions[0], questionText: "Next question" }] };
        vi.mocked(api.get).mockResolvedValue({ data: { session } });
        store.dispatch(setActiveSession(session));
        vi.mocked(api.post).mockResolvedValue({ data: { message: "accepted" } });
        const stop = vi.fn().mockResolvedValue(null);
        const { result } = renderHook(() => useInterviewSession(stop, vi.fn()), { wrapper });
        await waitFor(() => expect(api.get).toHaveBeenCalled());
        act(() => result.current.updateDraftAnswer("A typed answer"));
        await act(() => result.current.handleSubmitAnswer());
        const form = vi.mocked(api.post).mock.calls[0][1] as FormData;
        expect(form.get("answerText")).toBe("A typed answer");expect(form.has("audio")).toBe(false);
        act(() => store.dispatch(setActiveSession({ ...session, questions: [{ ...session.questions[0], processingError: "Provider unavailable. Retry." }, session.questions[1]] })));
        await waitFor(() => expect(result.current.isQuestionLocked).toBe(false));
        expect(result.current.drafts[0].answerText).toBe("A typed answer");
        await act(() => result.current.handleSubmitAnswer());
        expect(api.post).toHaveBeenCalledTimes(2);
        act(() => store.dispatch(setActiveSession({ ...session, questions: [{ ...session.questions[0], isSubmitted: true, isEvaluated: true }, session.questions[1]] })));
        await act(() => result.current.handleNavigation(1));
        expect(result.current.currentQuestionIndex).toBe(1);
    });
    it("uploads final recorded audio once, unlocks failed processing for retry, and locks completed sessions", async () => {
        const { session, store, wrapper } = interviewFixture();
        let finishUpload: (value: { data: { message: string } }) => void = () => {};
        vi.mocked(api.post).mockImplementation(() => new Promise(resolve => { finishUpload = resolve; }));
        const stop = vi.fn().mockResolvedValue(new Blob(["final answer"], { type: "audio/webm" }));
        const { result } = renderHook(() => useInterviewSession(stop, vi.fn()), { wrapper });
        await waitFor(() => expect(api.get).toHaveBeenCalled());
        let submission: Promise<void>;
        act(() => { submission = result.current.handleSubmitAnswer(); void result.current.handleSubmitAnswer(); });
        await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
        const form = vi.mocked(api.post).mock.calls[0][1] as FormData;
        expect((form.get("audio") as Blob).size).toBe(12);
        await act(async () => { finishUpload({ data: { message: "accepted" } }); await submission; });
        act(() => store.dispatch(setActiveSession({ ...session, questions: [{ ...session.questions[0], processingError: "STT failed. Retry." }] })));
        await waitFor(() => expect(result.current.isQuestionLocked).toBe(false));
        let retry: Promise<void>;
        act(() => { retry = result.current.handleSubmitAnswer(); void result.current.handleSubmitAnswer(); });
        await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
        expect(result.current.isQuestionLocked).toBe(true);
        await act(async () => { finishUpload({ data: { message: "accepted" } }); await retry; });
        act(() => store.dispatch(setActiveSession({ ...session, status: "completed" })));
        expect(result.current.isQuestionLocked).toBe(true);
        await act(() => result.current.handleSubmitAnswer());
        expect(api.post).toHaveBeenCalledTimes(2);
    });
    it("preserves company/track in the typed creation request", async () => {
        const { store } = interviewFixture();
        const body = { role: "Backend", level: "Junior", interviewType: "company-specific" as const, count: 2, company: "Acme", companyTrack: "Platform" };
        vi.mocked(api.post).mockResolvedValue({ data: { sessionId: "new", status: "processing", message: "created" } });
        await store.dispatch(createSession(body)).unwrap();
        expect(api.post).toHaveBeenCalledWith("/sessions", body);
    });
    it("propagates finish failures so the runner can leave its loading state", async () => {
        const { wrapper } = interviewFixture();
        vi.mocked(api.post).mockRejectedValue(new Error("Failed to end"));
        const { result } = renderHook(() => useInterviewSession(vi.fn().mockResolvedValue(null), vi.fn()), { wrapper });
        await act(async () => { await expect(result.current.confirmFinishInterview()).rejects.toBeDefined(); });
    });
});
