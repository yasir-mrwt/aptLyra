import { useCallback, useEffect, useRef, useState } from "react";
import apiClient from "../services/apiClient";

/**
 * Voice of the AI interviewer.
 *
 * Fetches Groq TTS audio (WAV) from the backend and plays it through a
 * WebAudio AnalyserNode so the avatar's mouth can move with the real
 * amplitude of the speech. Falls back to the browser's speechSynthesis
 * (with a simulated amplitude) if the TTS endpoint is unavailable.
 */

const MUTE_STORAGE_KEY = "preptalk_interviewer_muted";

interface UseInterviewerVoiceResult {
    isSpeaking: boolean;
    isPreparing: boolean;
    voiceError: string | null;
    usingBrowserVoice: boolean;
    isMuted: boolean;
    /** 0..1 — drives the avatar's mouth openness. */
    amplitude: number;
    /** Replay the current question aloud. */
    speak: () => void;
    stopSpeaking: () => void;
    toggleMute: () => void;
}

export const useInterviewerVoice = (
    sessionId: string | undefined,
    questionIndex: number,
    questionText: string | undefined,
    enabled = true
): UseInterviewerVoiceResult => {
    const [isPreparing, setIsPreparing] = useState(false);
    const [voiceError, setVoiceError] = useState<string | null>(null);
    const [usingBrowserVoice, setUsingBrowserVoice] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [amplitude, setAmplitude] = useState(0);
    const [isMuted, setIsMuted] = useState<boolean>(
        () => localStorage.getItem(MUTE_STORAGE_KEY) === "true"
    );

    const audioCtxRef = useRef<AudioContext | null>(null);
    const sourceRef = useRef<AudioBufferSourceNode | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const rafRef = useRef<number>(0);
    const fallbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const audioCacheRef = useRef<Map<number, AudioBuffer>>(new Map());
    const lastSpokenRef = useRef<number>(-1);
    const generationRef = useRef(0); // invalidates stale async playback

    const stopSpeaking = useCallback(() => {
        generationRef.current += 1;
        cancelAnimationFrame(rafRef.current);
        if (fallbackTimerRef.current) {
            clearInterval(fallbackTimerRef.current);
            fallbackTimerRef.current = null;
        }
        if (sourceRef.current) {
            try { sourceRef.current.stop(); } catch { /* already stopped */ }
            sourceRef.current = null;
        }
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
        setIsSpeaking(false);
        setIsPreparing(false);
        setAmplitude(0);
    }, []);

    /** Browser speechSynthesis fallback with a simulated mouth movement. */
    const speakWithBrowser = useCallback((text: string, generation: number) => {
        setIsPreparing(false);
        if (!window.speechSynthesis) {
            setVoiceError("Voice unavailable. Read the question and retry voice when ready.");
            return;
        }
        setUsingBrowserVoice(true);

        const utterance = new SpeechSynthesisUtterance(text);
        const voices = window.speechSynthesis.getVoices();
        const femaleVoice = voices.find((v) =>
            /female|samantha|victoria|karen|zira|susan|google uk english female/i.test(v.name)
        );
        if (femaleVoice) utterance.voice = femaleVoice;
        utterance.rate = 0.95;
        utterance.pitch = 1.1;

        utterance.onstart = () => {
            if (generationRef.current !== generation) return;
            setIsSpeaking(true);
            fallbackTimerRef.current = setInterval(() => {
                setAmplitude(0.25 + Math.random() * 0.6);
            }, 90);
        };
        const finish = () => {
            if (generationRef.current !== generation) return;
            if (fallbackTimerRef.current) {
                clearInterval(fallbackTimerRef.current);
                fallbackTimerRef.current = null;
            }
            if (generationRef.current === generation) {
                setIsSpeaking(false);
                setAmplitude(0);
            }
        };
        utterance.onend = finish;
        utterance.onerror = () => {
            if (generationRef.current !== generation) return;
            finish();
            setVoiceError("Voice playback failed. Use Replay to retry.");
        };

        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
    }, []);

    const playBuffer = useCallback((buffer: AudioBuffer, generation: number) => {
        const ctx = audioCtxRef.current;
        if (!ctx || generationRef.current !== generation) return;

        const source = ctx.createBufferSource();
        source.buffer = buffer;

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        analyser.connect(ctx.destination);

        sourceRef.current = source;
        analyserRef.current = analyser;

        const data = new Uint8Array(analyser.frequencyBinCount);
        let smoothed = 0;
        const tick = () => {
            if (generationRef.current !== generation) return;
            analyser.getByteTimeDomainData(data);
            let sumSquares = 0;
            for (let i = 0; i < data.length; i++) {
                const v = (data[i] - 128) / 128;
                sumSquares += v * v;
            }
            const rms = Math.sqrt(sumSquares / data.length);
            // Smooth + boost so normal speech opens the mouth visibly
            smoothed = smoothed * 0.6 + Math.min(1, rms * 4.5) * 0.4;
            setAmplitude(smoothed);
            rafRef.current = requestAnimationFrame(tick);
        };

        source.onended = () => {
            if (generationRef.current === generation) {
                cancelAnimationFrame(rafRef.current);
                setIsSpeaking(false);
                setAmplitude(0);
            }
        };

        setIsSpeaking(true);
        source.start();
        rafRef.current = requestAnimationFrame(tick);
    }, []);

    const speakQuestion = useCallback(async (qIndex: number, text: string) => {
        if (!enabled || isMuted || !sessionId || !text) return;
        stopSpeaking();
        const generation = generationRef.current;
        setIsPreparing(true);
        setVoiceError(null);
        setUsingBrowserVoice(false);

        try {
            if (!audioCtxRef.current) {
                audioCtxRef.current = new AudioContext();
            }
            if (audioCtxRef.current.state === "suspended") {
                await audioCtxRef.current.resume();
            }

            const cached = audioCacheRef.current.get(qIndex);
            if (cached) {
                setIsPreparing(false);
                playBuffer(cached, generation);
                return;
            }

            const res = await apiClient.post(
                `/sessions/${sessionId}/speak`,
                { questionIndex: qIndex },
                { responseType: "arraybuffer" }
            );
            if (generationRef.current !== generation) return;

            const buffer = await audioCtxRef.current.decodeAudioData(res.data);
            if (generationRef.current !== generation) return;
            audioCacheRef.current.set(qIndex, buffer);
            setIsPreparing(false);

            playBuffer(buffer, generation);
        } catch {
            // Server TTS unavailable → browser voice
            if (generationRef.current === generation) {
                speakWithBrowser(text, generation);
            }
        }
    }, [sessionId, enabled, isMuted, stopSpeaking, playBuffer, speakWithBrowser]);

    const speak = useCallback(() => {
        if (questionText) speakQuestion(questionIndex, questionText);
    }, [questionIndex, questionText, speakQuestion]);

    const toggleMute = useCallback(() => {
        const next = !isMuted;
        localStorage.setItem(MUTE_STORAGE_KEY, String(next));
        setIsMuted(next);
        lastSpokenRef.current = -1;
        if (next) stopSpeaking();
    }, [isMuted, stopSpeaking]);

    // Reset the spoken marker when the session changes + cleanup on unmount
    useEffect(() => {
        lastSpokenRef.current = -1;
        audioCacheRef.current = new Map();
        return () => {
            stopSpeaking();
            audioCtxRef.current?.close().catch(() => undefined);
            audioCtxRef.current = null;
        };
    }, [sessionId, stopSpeaking]);

    useEffect(() => {
        if (enabled) return;
        const timer = window.setTimeout(stopSpeaking, 0);
        return () => window.clearTimeout(timer);
    }, [enabled, stopSpeaking]);

    // Auto-speak whenever a new question comes into view
    useEffect(() => {
        if (!enabled || isMuted || !questionText || !sessionId) return;
        if (lastSpokenRef.current === questionIndex) return;
        const timer = window.setTimeout(() => {
            lastSpokenRef.current = questionIndex;
            void speakQuestion(questionIndex, questionText);
        }, 0);
        return () => window.clearTimeout(timer);
    }, [questionIndex, questionText, sessionId, enabled, isMuted, speakQuestion]);

    return { isSpeaking, isPreparing, voiceError, usingBrowserVoice, isMuted, amplitude, speak, stopSpeaking, toggleMute };
};
