import { createSlice, createAsyncThunk, type PayloadAction } from "@reduxjs/toolkit";
import { getGamificationProfile, getLeaderboard } from "../../services/gamificationApi";
import type { GamificationProfile, LeaderboardEntry } from "../../types/gamification";

interface GamificationState {
  profile: GamificationProfile | null;
  leaderboard: LeaderboardEntry[];
  isLoading: boolean;
  isError: boolean;
  message: string;
}

const initialState: GamificationState = {
  profile: null,
  leaderboard: [],
  isLoading: false,
  isError: false,
  message: "",
};

const extractErrorMessage = (error: unknown): string => {
  const err = error as { response?: { data?: { message?: string } }; message?: string };
  return err.response?.data?.message || err.message || String(error);
};

export const fetchGamificationProfile = createAsyncThunk(
  "gamification/fetchProfile",
  async (_, thunkAPI) => {
    try {
      return await getGamificationProfile();
    } catch (error: unknown) {
      return thunkAPI.rejectWithValue(extractErrorMessage(error));
    }
  }
);

export const fetchLeaderboard = createAsyncThunk(
  "gamification/fetchLeaderboard",
  async (limit: number | undefined, thunkAPI) => {
    try {
      return await getLeaderboard(limit);
    } catch (error: unknown) {
      return thunkAPI.rejectWithValue(extractErrorMessage(error));
    }
  }
);

export const gamificationSlice = createSlice({
  name: "gamification",
  initialState,
  reducers: {
    resetGamification: (state) => {
      state.isLoading = false;
      state.isError = false;
      state.message = "";
    },
    updateProfileFromSocket: (state, action: PayloadAction<{ xp?: number; level?: number }>) => {
      if (state.profile && action.payload.xp !== undefined) {
        state.profile.xp = action.payload.xp;
        state.profile.level = action.payload.level ?? state.profile.level;
      }
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchGamificationProfile.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(fetchGamificationProfile.fulfilled, (state, action) => {
        state.isLoading = false;
        state.profile = action.payload;
      })
      .addCase(fetchGamificationProfile.rejected, (state, action) => {
        state.isLoading = false;
        state.isError = true;
        state.message = action.payload as string;
      })
      .addCase(fetchLeaderboard.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(fetchLeaderboard.fulfilled, (state, action) => {
        state.isLoading = false;
        state.leaderboard = action.payload;
      })
      .addCase(fetchLeaderboard.rejected, (state, action) => {
        state.isLoading = false;
        state.isError = true;
        state.message = action.payload as string;
      });
  },
});

export const { resetGamification, updateProfileFromSocket } = gamificationSlice.actions;
export default gamificationSlice.reducer;
