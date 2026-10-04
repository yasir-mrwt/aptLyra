export interface SpeechAnalysisResult {
  transcript: string;
  metrics: {
    duration_seconds: number;
    word_count: number;
    pace_wpm: number;
    total_pause_duration_ms: number;
    pause_count: number;
    filler_word_count: number;
    filler_words: Array<{ word: string; count: number }>;
    confidence_score: number;
    clarity_score: number;
  };
}
