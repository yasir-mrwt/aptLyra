/**
 * @file services/queue/steps/utils.ts
 * @description Shared utilities for resume worker steps
 */

/**
 * Build the AI Service URL from environment.
 */
export const getAIServiceUrl = (): string => {
  return process.env.AI_SERVICE_URL || "http://localhost:8000";
};
