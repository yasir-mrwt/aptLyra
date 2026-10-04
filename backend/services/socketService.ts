/**
 * @file services/socketService.ts
 * @description Socket.IO real-time communication utilities
 */

import { Server } from "socket.io";

/**
 * Utility to push real-time updates to the frontend via Socket.io.
 *
 * @param {Server} io - Socket.io server instance.
 * @param {string} userId - ID of the user to notify.
 * @param {string} sessionId - ID of the interview session.
 * @param {string} status - Descriptive status code (e.g., "AI_EVALUATING").
 * @param {string} message - Human-readable message for the UI.
 * @param {Record<string, any>|null} session - Optional full session object for major state updates.
 */
export const pushSocketUpdate = (
  io: Server,
  userId: string,
  sessionId: string,
  status: string,
  message: string,
  session: Record<string, any> | null = null
): void => {
  if (!io) {
    console.warn("Socket.io instance not found, update not pushed.");
    return;
  }

  io.to(userId.toString()).emit("sessionUpdate", {
    sessionId,
    status,
    message,
    session,
  });
};

/**
 * Utility to push real-time updates about resume processing.
 *
 * @param {Server} io - Socket.io server instance.
 * @param {string} userId - ID of the user to notify.
 * @param {Record<string, any>} payload - Status payload.
 */
export const emitResumeStatus = (
  io: Server,
  userId: string,
  payload: Record<string, any>
): void => {
  if (!io) return;
  io.to(userId.toString()).emit("resume:status", payload);
};
