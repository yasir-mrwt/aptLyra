import type { SessionState, SocketUpdatePayload } from "../../types/session";

/**
 * Handles complex session state updates coming from a socket payload.
 * This function extracts core terminal logic from the session slice.
 */
export const updateSessionFromSocket = (
    state: SessionState,
    payload: SocketUpdatePayload
) => {
    const { sessionId, status, message, session } = payload;
    state.message = message;
    
    const upperStatus = (status || "").toUpperCase();

    // Reset error state for non-failure progress updates
    if (!upperStatus.includes("ERROR") && !upperStatus.includes("FAILED")) {
        state.isError = false;
    }

    if (!Array.isArray(state.sessions)) {
        state.sessions = [];
    }

    // Handle mid-interview status updates (e.g. Q1 transcript ready)
    if (!session && state.activeSession && state.activeSession._id === sessionId) {
        const qMatch = message.match(/Q(\d+)/);
        if (qMatch) {
            const qIndex = parseInt(qMatch[1]) - 1;
            const questions = state.activeSession.questions;
            if (questions && qIndex >= 0 && qIndex < questions.length && upperStatus.includes('AI_')) {
                questions[qIndex].isSubmitted = true;
            }
        }
    }

    // Determine completion or failure
    const isFinished = upperStatus.includes("READY") || upperStatus.includes("FAILED") || upperStatus.includes("ERROR") || upperStatus.includes("COMPLETED");
    const hasError = upperStatus.includes("FAILED") || upperStatus.includes("ERROR");

    if (isFinished) {
        state.isGenerating = false;
        if (hasError) {
            state.isError = true;
            state.message = message || "Operation failed";
        }
    }

    // Handle full session object replacement if sent
    if (session) {
        if (!state.activeSession || state.activeSession._id === sessionId) {
            state.activeSession = session;
        }

        const index = state.sessions.findIndex((s) => s._id === sessionId);
        if (index !== -1) {
            const oldSession = state.sessions[index];
            state.sessions[index] = session;
            
            if (state.stats && oldSession.status !== session.status) {
                if ((oldSession.status === 'in-progress') && session.status === 'completed') {
                    state.stats.activeSessions = Math.max(0, state.stats.activeSessions - 1);
                    state.stats.completedSessions = (state.stats.completedSessions || 0) + 1;
                }
            }
        } else if (upperStatus.includes("READY") || upperStatus.includes("COMPLETED")) {
            state.sessions.unshift(session);
            
            if (state.stats) {
                state.stats.totalSessions = (state.stats.totalSessions || 0) + 1;
                if (session.status === 'completed') {
                    state.stats.completedSessions = (state.stats.completedSessions || 0) + 1;
                } else if (session.status === 'in-progress') {
                    state.stats.activeSessions = (state.stats.activeSessions || 0) + 1;
                }
            }
        }
    }
};
