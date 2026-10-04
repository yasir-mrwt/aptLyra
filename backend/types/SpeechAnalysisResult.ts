export interface SpeechAnalysisResult {
  transcript: string;
  metrics_status: "available" | "unavailable";
  metrics: null | {
    duration_seconds: number;
    speaking_time_seconds: number;
    pause_time_seconds: number;
    pause_count: number;
    word_count: number;
    pace_wpm: number;
    filler_words_count: number;
  };
}
