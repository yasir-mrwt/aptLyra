import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import api from "../../services/api";
import { handleThunkError } from "../../utils/thunkUtils";
import { updateSessionFromSocket } from "./sessionUtils";
import type { SessionState, Session, SocketUpdatePayload, PaginatedSessionsResponse } from "../../types/session";

const initialState: SessionState = {
    sessions: [],
    activeSession: null,
    isGenerating: false,
    isError: false,
    message: "",
    isLoading: false,
    pagination: null,
    stats: null,
};

/**
 * Fetch a paginated list of sessions for the current user.
 */
export const getSession = createAsyncThunk<PaginatedSessionsResponse, { page?: number; limit?: number } | void, { rejectValue: string }>(
    "session/getAll",
    async (args, thunkAPI) => {
        try {
            const page = args?.page || 1;
            const limit = args?.limit || 9;
            const response = await api.get(`sessions?page=${page}&limit=${limit}`);
            return response.data;
        } catch (error) {
            return thunkAPI.rejectWithValue(handleThunkError(error));
        }
    }
);

/**
 * Initialize a new interview session and trigger AI question generation.
 */
export const createSession = createAsyncThunk<Session, Record<string, unknown>, { rejectValue: string }>(
    "session/create",
    async (sessionData, thunkAPI) => {
        try {
            const response = await api.post<Session>(`/sessions`, sessionData);
            return response.data;
        } catch (error) {
            return thunkAPI.rejectWithValue(handleThunkError(error));
        }
    }
);

/**
 * Fetch full details of a single interview session.
 */
export const getSessionById = createAsyncThunk<Session, string, { rejectValue: string }>(
    "session/getOne",
    async (sessionId, thunkAPI) => {
        try {
            const response = await api.get<Session>(`/sessions/${sessionId}`);
            return response.data;
        } catch (error) {
            return thunkAPI.rejectWithValue(handleThunkError(error));
        }
    }
);

/**
 * Remove an interview session from the database.
 */
export const deleteSession = createAsyncThunk<Session, string, { rejectValue: string }>(
    "session/delete",
    async (sessionId, thunkAPI) => {
        try {
            const response = await api.delete<Session>(`/sessions/${sessionId}`);
            return response.data;
        } catch (error) {
            return thunkAPI.rejectWithValue(handleThunkError(error));
        }
    }
);

/**
 * Submit candidate answer (audio/code) for a specific question.
 */
export const submitAnswer = createAsyncThunk<Session, { sessionId: string; formData: FormData }, { rejectValue: string }>(
    "session/submitAnswer",
    async ({ sessionId, formData }, thunkAPI) => {
        try {
            const response = await api.post<Session>(`/sessions/${sessionId}/submit-answer`, formData);
            return response.data;
        } catch (error) {
            return thunkAPI.rejectWithValue(handleThunkError(error));
        }
    }
);

/**
 * Manually end an active interview session.
 */
export const endSession = createAsyncThunk<Session, string, { rejectValue: string }>(
    "session/endSession",
    async (sessionId, thunkAPI) => {
        try {
            const response = await api.post<Session>(`/sessions/${sessionId}/end`);
            return response.data;
        } catch (error) {
            return thunkAPI.rejectWithValue(handleThunkError(error));
        }
    }
);

export const sessionSlice = createSlice({
    name: "session",
    initialState,
    reducers: {
        reset: () => initialState,
        socketUpdateSession: (state, action: PayloadAction<SocketUpdatePayload>) => {
            updateSessionFromSocket(state, action.payload);
        },
        setActiveSession: (state, action: PayloadAction<Session>) => {
            state.activeSession = action.payload;
        }
    },
    extraReducers: (builder) => {
        builder
            // Get all sessions
            .addCase(getSession.pending, (state) => {
                state.isLoading = true;
            })
            .addCase(getSession.fulfilled, (state, action) => {
                state.isLoading = false;
                const payload = action.payload;
                if (payload.pagination.currentPage === 1) {
                    state.sessions = payload.sessions;
                } else {
                    // Append logically, avoid duplicates
                    const newSessions = payload.sessions.filter((s: Session) => !state.sessions.find(existing => existing._id === s._id));
                    state.sessions = [...state.sessions, ...newSessions];
                }
                state.pagination = payload.pagination;
                if (payload.stats) state.stats = payload.stats;
            })
            .addCase(getSession.rejected, (state, action) => {
                state.isLoading = false;
                state.isError = true;
                state.message = action.payload || "Failed to fetch sessions";
            })

            // Create new session
            .addCase(createSession.pending, (state) => {
                state.isLoading = true;
            })
            .addCase(createSession.fulfilled, (state, action) => {
                state.isLoading = false;
                state.isGenerating = true;
                if (!Array.isArray(state.sessions)) {
                    state.sessions = [];
                }
                const payload = action.payload as unknown;
                // Prepend new session to lists
                if (payload && typeof payload === 'object' && ('_id' in payload || 'role' in payload)) {
                    const newSession = payload as Session;
                    state.sessions.unshift(newSession);
                    
                    if (state.stats) {
                        state.stats.totalSessions = (state.stats.totalSessions || 0) + 1;
                        state.stats.activeSessions = (state.stats.activeSessions || 0) + 1;
                    }
                }
            })
            .addCase(createSession.rejected, (state, action) => {
                state.isLoading = false;
                state.isError = true;
                state.message = action.payload || "Failed to create interview";
            })

            // Get session by ID
            .addCase(getSessionById.pending, (state) => {
                state.isLoading = true;
            })
            .addCase(getSessionById.fulfilled, (state, action) => {
                state.isLoading = false;
                const payload = action.payload as { session?: Session };
                if (payload && payload.session) {
                    state.activeSession = payload.session;
                } else {
                    state.activeSession = action.payload as Session;
                }
            })
            .addCase(getSessionById.rejected, (state, action) => {
                state.isLoading = false;
                state.isError = true;
                state.message = action.payload || "Failed to locate session";
            })

            // Delete session
            .addCase(deleteSession.pending, (state) => {
                state.isLoading = true;
            })
            .addCase(deleteSession.fulfilled, (state, action) => {
                state.isLoading = false;
                const sessionsList = Array.isArray(state.sessions) ? state.sessions : [];
                const payloadId = (action.payload as { id?: string; _id?: string }).id || (action.payload as { id?: string; _id?: string })._id;
                
                const sessionToDelete = sessionsList.find(s => s._id === payloadId);
                if (sessionToDelete && state.stats) {
                    state.stats.totalSessions = Math.max(0, state.stats.totalSessions - 1);
                    if (sessionToDelete.status === 'completed') {
                        state.stats.completedSessions = Math.max(0, state.stats.completedSessions - 1);
                    } else if (sessionToDelete.status === 'in-progress') {
                        state.stats.activeSessions = Math.max(0, state.stats.activeSessions - 1);
                    }
                }

                state.sessions = sessionsList.filter((s) => s._id !== payloadId);
            })
            .addCase(deleteSession.rejected, (state, action) => {
                state.isLoading = false;
                state.isError = true;
                state.message = action.payload || "Failed to delete session";
            })

            // Submit answer
            .addCase(submitAnswer.pending, () => { })
            .addCase(submitAnswer.fulfilled, (state, action) => {
                state.isLoading = false;
                if (action.payload && Array.isArray(action.payload.questions)) {
                    state.activeSession = action.payload;
                }
            })
            .addCase(submitAnswer.rejected, (state, action) => {
                state.isLoading = false;
                state.isError = true;
                state.message = action.payload || "Evaluation submission failed";
            })

            // End session
            .addCase(endSession.pending, (state) => {
                state.isLoading = true;
            })
            .addCase(endSession.fulfilled, (state, action) => {
                state.isLoading = false;
                const payload = action.payload as { session?: Session };
                state.activeSession = payload.session || (action.payload as Session);
            })
            .addCase(endSession.rejected, (state, action) => {
                state.isLoading = false;
                state.isError = true;
                state.message = action.payload || "Failed to end interview session";
            });
    }
});

export const { reset, socketUpdateSession, setActiveSession } = sessionSlice.actions;
export default sessionSlice.reducer;