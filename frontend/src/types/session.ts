export type InterviewType = "oral-only" | "coding-mix" | "company-specific";

export interface CreateSessionRequest {
    role: string;
    level: string;
    interviewType: InterviewType;
    count: number;
    company?: string;
    companyTrack?: string;
    resumeId?: string;
}

export interface CreateSessionResponse {
    message: string;
    sessionId: string;
    status: "processing";
}

export interface SpeechMetrics {
    fillerWordCount: number;
    fillerWords: { word: string; count: number }[];
    speakingPaceWpm: number;
    paceRating: string;
    totalPauseDurationMs: number;
    pauseCount: number;
    clarityScore: number;
    confidenceScore: number;
}

export interface Question {
    questionText: string;
    questionType: "coding" | "oral" | "system-design";
    isEvaluated: boolean;
    isSubmitted: boolean;
    userAnswerText?: string;
    userSubmittedCode?: string;
    idealAnswer?: string;
    technicalScore?: number;
    confidenceScore?: number;
    aiFeedback?: string;
    speechMetrics?: SpeechMetrics;
    speechMetricsStatus?: "available" | "unavailable";
    processingError?: string;
    followUpPending?: boolean;
    /** Set when this question is a follow-up probe of an earlier answer. */
    followUpOf?: number;
}

export interface Session {
    _id: string;
    user: string;
    role: string;
    level: string;
    interviewType: string;
    company?: string;
    companyTrack?: string;
    questions: Question[];
    status: "pending" | "in-progress" | "completed" | "failed" | "cancelled";
    startTime?: Date | string;
    endTime?: Date | string | number;
    overallScore?: number;
    metrics?: {
        avgTechnical?: number;
        avgConfidence?: number;
    };
    createdAt?: string;
    updatedAt?: string;

}

export interface Pagination {
    totalSessions: number;
    totalPages: number;
    currentPage: number;
    pageSize: number;
}

export interface PaginatedSessionsResponse {
    message: string;
    sessions: Session[];
    pagination: Pagination;
    stats: {
        totalSessions: number;
        completedSessions: number;
        activeSessions: number;
    };
}

export interface SessionState {
    sessions: Session[];
    activeSession: Session | null;
    isGenerating: boolean;
    isError: boolean;
    message: string;
    isLoading: boolean;
    pagination: Pagination | null;
    recording?: {
        isAvailable: boolean;
        recordingUrl?: string;
        totalDurationMs?: number;
        questionTimestamps?: {
            questionIndex: number;
            startTime: string;
            endTime?: string;
        }[];
    };
    stats: {
        totalSessions: number;
        completedSessions: number;
        activeSessions: number;
    } | null;
}

export interface SocketUpdatePayload {
    sessionId: string;
    status: string;
    message: string;
    session?: Session;
}

/**
 * Structure for locally persisted interview drafts in IndexedDB.
 */
export type DraftRecord = Record<number, { code?: string; audio?: Blob }>;
