import { useState, useRef, useEffect } from "react";
import { toast } from "react-toastify";

export const useAudioRecorder = () => {
    const [isRecording, setIsRecording] = useState(false);
    const [isStarting, setIsStarting] = useState(false);
    const [recordingError, setRecordingError] = useState<string | null>(null);
    const [recordingTime, setRecordingTime] = useState(0);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const startingRef = useRef(false);
    const mountedRef = useRef(false);
    const stopPromiseRef = useRef<Promise<Blob | null> | null>(null);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
            streamRef.current?.getTracks().forEach(track => track.stop());
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    const startRecording = async (onStop: (audioBlob: Blob) => void) => {
        if (startingRef.current || mediaRecorderRef.current?.state === "recording") return;
        startingRef.current = true;
        setIsStarting(true);
        setRecordingError(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            if (!mountedRef.current) { stream.getTracks().forEach(track => track.stop()); return; }
            streamRef.current = stream;
            const recorder = new MediaRecorder(stream);
            mediaRecorderRef.current = recorder;
            const chunks: Blob[] = [];
            let resolveStop: (value: Blob | null) => void = () => {};
            stopPromiseRef.current = new Promise(resolve => { resolveStop = resolve; });
            recorder.ondataavailable = event => { if (event.data.size > 0) chunks.push(event.data); };
            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
                stream.getTracks().forEach(track => track.stop());
                if (timerRef.current) clearInterval(timerRef.current);
                if (mountedRef.current) {
                    setIsRecording(false);
                    if (blob.size) onStop(blob);
                    else setRecordingError("Recording was empty. Please record again.");
                }
                resolveStop(blob.size ? blob : null);
            };
            recorder.start(1000);
            setIsRecording(true);
            setRecordingTime(0);
            timerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
        } catch {
            streamRef.current?.getTracks().forEach(track => track.stop());
            setRecordingError("Microphone unavailable. Allow access and retry recording.");
            toast.error("Failed to start recording. Please allow microphone access.");
        } finally {
            startingRef.current = false;
            if (mountedRef.current) setIsStarting(false);
        }
    };

    /** Await final dataavailable/onstop before an answer is uploaded. */
    const stopRecording = async (): Promise<Blob | null> => {
        const pending = stopPromiseRef.current;
        if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
        const blob = pending ? await pending : null;
        if (stopPromiseRef.current === pending) stopPromiseRef.current = null;
        return blob;
    };

    return { isRecording, isStarting, recordingError, recordingTime, startRecording, stopRecording, setRecordingTime };
};
