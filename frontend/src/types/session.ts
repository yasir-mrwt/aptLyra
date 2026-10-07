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
    operationId?: string;
    processingState?: "received"|"transcribing"|"evaluating"|"evaluated"|"abstained"|"failed"|"cancelled";
    probeOperationId?: string;
    followUpConceptId?: string;
    followUpRationale?: string;
    evaluation?: RubricEvaluation;
    planItemId?: string;
    questionVersionId?: string;
    category?: string;
    evidenceUnavailable?: boolean;
    language?: string;
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
    runtimeVersion?: string;
    runtimeState?: "active"|"finishing"|"completed";
    revision?: number;
    operations?: InterviewOperation[];
    report?: {id:string;snapshotRevision:number;createdAt:string;scoringVersion:string};
    scoringVersion?: "legacy"|"rubric-v1";
    reviewedSummary?: ReviewedSummary;
    planId?: string;
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
    overallScore?: number | null;
    metrics?: {
        avgTechnical?: number | null;
        avgConfidence?: number | null;
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
    socketConnection?: "connecting" | "connected" | "recovering";
    requestedSessionId?: string;
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
    status?: string;
    message?: string;
    session?: Session;
    revision?: number;
    operationId?: string;
    eventId?: string;
    state?: string;
    errorCode?: string|null;
}
export interface InterviewOperation {
    id:string;type:string;status:"queued"|"running"|"succeeded"|"retryable_failed"|"terminal_failed";
    questionIndex:number|null;attempts:number;maxAttempts:number;totalAttempts:number;manualRetries:number;
    retryAvailable:boolean;nextRetryAt:string|null;errorCode:string|null;
}

/**
 * Structure for locally persisted interview drafts in IndexedDB.
 */
export type DraftRecord = Record<number, { code?: string; answerText?: string; audio?: Blob; diagram?: Blob; diagramElements?: readonly unknown[] }>;
export interface RubricEvaluation {
    id?:string; rubricStatus:"reviewed"|"provisional"|"unavailable"; status:"scored"|"abstained";
    technicalScore:number|null; evaluatorConfidence:"high"|"medium"|"low"; reasons:string[];
    dimensions:Partial<Record<"correctness"|"concept-coverage"|"reasoning"|"practical-application"|"trade-off-awareness",number>>;
    concepts:{id:string;label:string;judgment:string;explanation:string;sourceIds:string[]}[];
    feedback:string;communication:string;objective:{status:string;kind:string;summary:string};scoringVersion:string;
}
export interface ReviewedSummary {technicalScore:number|null;eligible:number;planned:number;provisional:number;abstained:number;reason:string|null;scoringVersion:string;byRoot:Record<string,number|null>}
