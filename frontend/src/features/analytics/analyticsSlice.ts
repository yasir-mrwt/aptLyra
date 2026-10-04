import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import apiClient from "../../services/apiClient";

export interface BadgeRecord {
    badgeId: string;
    earnedAt: string;
}

export interface AnalyticsData {
    stats: {
        totalSessions: number;
        averageOverallScore: number;
        averageTechnicalScore: number;
        averageConfidenceScore: number;
    };
    progress: { date: string; technicalScore: number; confidenceScore: number }[];
    byRole: { _id: string; avgScore: number }[];
    speech?: {
        avgPace: number;
        avgFillerWords: number;
        avgClarity: number;
    };
    gamification?: {
        currentLevel: number;
        currentTitle?: string;
        xp: number;
        streakDays: number;
        currentLevelXp: number;
        nextLevelXp: number | null;
        badges?: BadgeRecord[];
        achievements?: string[];
    };
}

interface AnalyticsState {
    data: AnalyticsData | null;
    isLoading: boolean;
    isError: boolean;
    message: string;
}

const initialState: AnalyticsState = {
    data: null,
    isLoading: false,
    isError: false,
    message: "",
};


export const getAnalytics = createAsyncThunk(
    "analytics/get",
    async (_, thunkAPI) => {
        try {

            const response = await apiClient.get("/analytics/");
            return response.data;
        } catch (error: unknown) {
            const err = error as { response?: { data?: { message?: string } }, message?: string };
            const message = (err.response && err.response.data && err.response.data.message) || err.message || String(error);
            return thunkAPI.rejectWithValue(message);
        }
    }
);

export const analyticsSlice = createSlice({
    name: "analytics",
    initialState,
    reducers: {
        reset: (state) => {
            state.isLoading = false;
            state.isError = false;
            state.message = "";
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(getAnalytics.pending, (state) => {
                state.isLoading = true;
            })
            .addCase(getAnalytics.fulfilled, (state, action) => {
                state.isLoading = false;
                state.data = action.payload;
            })
            .addCase(getAnalytics.rejected, (state, action) => {
                state.isLoading = false;
                state.isError = true;
                state.message = action.payload as string;
            });
    },
});

export const { reset } = analyticsSlice.actions;
export default analyticsSlice.reducer;
