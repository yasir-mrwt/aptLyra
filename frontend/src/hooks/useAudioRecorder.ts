import { useState, useRef, useEffect } from "react";
import { toast } from "react-toastify";

export const useAudioRecorder = () => {
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const streamRef = useRef<MediaStream | null>(null);
    const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        return () => {
            streamRef.current?.getTracks().forEach(track => track.stop());
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        };
    }, []);

    const startRecording = async (onStop: (audioBlob: Blob) => void) => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            mediaRecorderRef.current = new MediaRecorder(stream);
            audioChunksRef.current = [];

            mediaRecorderRef.current.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorderRef.current.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                onStop(audioBlob);
            };

            mediaRecorderRef.current.start(1000);
            setIsRecording(true);
            setRecordingTime(0);
            timerIntervalRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
        } catch {
            toast.error("Failed to start recording. Please allow microphone access.");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current?.state !== 'inactive') {
            mediaRecorderRef.current?.stop();
            streamRef.current?.getTracks().forEach(track => track.stop());
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
            setIsRecording(false);
        }
    };

    return {
        isRecording,
        recordingTime,
        startRecording,
        stopRecording,
        setRecordingTime
    };
};
