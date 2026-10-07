export const RUNTIME = "aptlyra-runtime-v1";
export type OperationStatus = "queued" | "running" | "succeeded" | "retryable_failed" | "terminal_failed";
export interface OperationView {
  id: string; type: string; status: OperationStatus; questionIndex: number | null;
  attempts: number; maxAttempts: number; errorCode: string | null; retryAvailable: boolean;
  totalAttempts: number; manualRetries: number;
  nextRetryAt: string | null;
}
export class SessionStateError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
export class RuntimeFailure extends Error {
  constructor(public code: string, public retryable = false) { super(code); }
}
