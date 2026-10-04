/**
 * @file types/errors.ts
 * @description Shared error and validation type definitions
 */

export type ErrorCode =
  | "INVALID_FILE"
  | "PARSING_ERROR"
  | "ANALYSIS_ERROR"
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR";

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
  value?: unknown;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ErrorResponse;
  requestId: string;
  timestamp: Date;
}

export class AppError extends Error {
  code: ErrorCode;
  details?: ErrorDetails;
  statusCode: number;

  constructor(code: ErrorCode, message: string, details?: ErrorDetails, statusCode: number = 500) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}
