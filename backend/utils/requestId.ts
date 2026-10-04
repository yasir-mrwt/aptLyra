/**
 * @file utils/requestId.ts
 * @description Request ID generation utilities
 */

import { v4 as uuidv4 } from "uuid";

/**
 * Generate a unique request ID
 */
export const generateRequestId = (): string => {
  return `req-${uuidv4()}`;
};

/**
 * Extract request ID from headers or generate one
 */
export const getOrGenerateRequestId = (headerValue?: string): string => {
  return headerValue || generateRequestId();
};
