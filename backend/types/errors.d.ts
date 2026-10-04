/**
 * @file types/errors.ts
 * @description Shared error and validation type definitions
 */
export type ErrorCode = "INVALID_FILE" | "PARSING_ERROR" | "ANALYSIS_ERROR" | "TIMEOUT" | "RATE_LIMITED" | "UNAUTHORIZED" | "NOT_FOUND" | "VALIDATION_ERROR" | "INTERNAL_ERROR";
export interface ErrorDetails {
    [key: string]: string | string[] | ErrorDetails;
}
export interface ErrorResponse {
    code: ErrorCode;
    message: string;
    details?: ErrorDetails;
    requestId: string;
    timestamp: Date;
}
export interface ValidationError {
    field: string;
    message: string;
    value?: any;
}
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: ErrorResponse;
    requestId: string;
    timestamp: Date;
}
export declare class AppError extends Error {
    code: ErrorCode;
    message: string;
    details?: ErrorDetails | undefined;
    statusCode: number;
    constructor(code: ErrorCode, message: string, details?: ErrorDetails | undefined, statusCode?: number);
}
//# sourceMappingURL=errors.d.ts.map