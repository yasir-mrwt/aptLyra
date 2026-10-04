import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";
import authApi from "../../services/authApi";
import type { AuthState, User, RegisterPendingResponse } from "../../types/user";

const storedUser = localStorage.getItem("user");
const user = storedUser ? JSON.parse(storedUser) : null;

const initialState: AuthState = {
    user: user ?? null,
    isError: false,
    message: "",
    isSuccess: false,
    isLoading: false,
    token: user?.token ?? null,
    isProfileLoading: false,
    isAvatarUploading: false,
    isAuthenticated: !!user,
    pendingVerificationEmail: null,
};

/**
 * Starts registration — the backend emails a 6-digit OTP and returns
 * { requiresVerification, email }. The account is created on verifyOtp.
 */
export const register = createAsyncThunk<RegisterPendingResponse, User, { rejectValue: string }>(
    "auth/register",
    async (user, thunkAPI) => {
        try {
            const response = await authApi.post<RegisterPendingResponse>(`user/register`, user);
            return response.data;
        } catch (error: unknown) {
            const message = axios.isAxiosError(error) ? error.response?.data?.message ?? error.message : String(error);
            return thunkAPI.rejectWithValue(message);
        }
    }
);

/**
 * Verifies the registration OTP — creates the account and logs in.
 */
export const verifyOtp = createAsyncThunk<User, { email: string; otp: string }, { rejectValue: string }>(
    "auth/verifyOtp",
    async (payload, thunkAPI) => {
        try {
            const response = await authApi.post<User>(`user/verify-otp`, payload);
            if (response.data) {
                localStorage.setItem("user", JSON.stringify(response.data));
            }
            return response.data;
        } catch (error: unknown) {
            const message = axios.isAxiosError(error) ? error.response?.data?.message ?? error.message : String(error);
            return thunkAPI.rejectWithValue(message);
        }
    }
);

/**
 * Requests a fresh registration OTP (60s server-side cooldown).
 */
export const resendOtp = createAsyncThunk<{ message: string }, string, { rejectValue: string }>(
    "auth/resendOtp",
    async (email, thunkAPI) => {
        try {
            const response = await authApi.post<{ message: string }>(`user/resend-otp`, { email });
            return response.data;
        } catch (error: unknown) {
            const message = axios.isAxiosError(error) ? error.response?.data?.message ?? error.message : String(error);
            return thunkAPI.rejectWithValue(message);
        }
    }
);

/**
 * Logins an existing user.
 */
export const login = createAsyncThunk<User, User, { rejectValue: string }>(
    "auth/login",
    async (user, thunkAPI) => {
        try {
            const response = await authApi.post<User>(`user/login`, user);
            if (response.data) {
                localStorage.setItem("user", JSON.stringify(response.data));
            }
            return response.data;
        } catch (error: unknown) {
            const message = axios.isAxiosError(error) ? error.response?.data?.message ?? error.message : String(error);
            return thunkAPI.rejectWithValue(message);
        }
    }
);

/**
 * Authenticates via Google OAuth.
 */
export const googleLogin = createAsyncThunk<User, string, { rejectValue: string }>(
    "auth/googleLogin",
    async (token, thunkAPI) => {
        try {
            const response = await authApi.post<User>(`user/google`, { token });
            if (response.data) {
                localStorage.setItem("user", JSON.stringify(response.data));
            }
            return response.data;
        } catch (error: unknown) {
            const message = axios.isAxiosError(error) ? error.response?.data?.message ?? error.message : String(error);
            return thunkAPI.rejectWithValue(message);
        }
    }
);

/**
 * Logs out the current user and clears local persistence.
 */
export const logout = createAsyncThunk<void, void, { rejectValue: string }>(
    "auth/logout",
    async (_, thunkAPI) => {
        try {
            localStorage.removeItem("user");
            try {
                await authApi.post(`user/logout`);
            } catch {
                // Ignore API error on logout if endpoint doesn't exist
            }
        } catch (error: unknown) {
            const message = axios.isAxiosError(error) ? error.response?.data?.message ?? error.message : String(error);
            return thunkAPI.rejectWithValue(message);
        }
    }
);

/**
 * Updates the user's profile information.
 */
export const updateProfile = createAsyncThunk<User, User, { rejectValue: string; state: { auth: AuthState } }>(
    "auth/update",
    async (user, thunkAPI) => {
        try {
            const token = thunkAPI.getState().auth.user?.token;
            const response = await authApi.put<User>(`user/profile`, user);
            if (response.data) {
                const updatedUser: User = { ...response.data, token: token || "" };
                localStorage.setItem("user", JSON.stringify(updatedUser));
                return updatedUser;
            }
            return response.data;
        } catch (error: unknown) {
            const message = axios.isAxiosError(error) ? error.response?.data?.message ?? error.message : String(error);
            return thunkAPI.rejectWithValue(message);
        }
    }
);

/**
 * Uploads a new profile photo (multipart) — backend stores it on Cloudinary.
 */
export const uploadAvatar = createAsyncThunk<User, File, { rejectValue: string; state: { auth: AuthState } }>(
    "auth/uploadAvatar",
    async (file, thunkAPI) => {
        try {
            const token = thunkAPI.getState().auth.user?.token;
            const formData = new FormData();
            formData.append("avatar", file);
            const response = await authApi.put<User>(`user/avatar`, formData, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            const updatedUser: User = { ...response.data, token: token || "" };
            localStorage.setItem("user", JSON.stringify(updatedUser));
            return updatedUser;
        } catch (error: unknown) {
            const message = axios.isAxiosError(error) ? error.response?.data?.error?.message ?? error.response?.data?.message ?? error.message : String(error);
            return thunkAPI.rejectWithValue(message);
        }
    }
);

const authSlice = createSlice({
    name: "auth",
    initialState,
    reducers: {
        reset: (state) => {
            state.isLoading = false;
            state.isSuccess = false;
            state.isError = false;
            state.message = "";
            state.isProfileLoading = false;
            state.isAvatarUploading = false;
        },
        clearPendingVerification: (state) => {
            state.pendingVerificationEmail = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(register.pending, (state) => { state.isLoading = true; })
            .addCase(register.fulfilled, (state, action) => {
                state.isLoading = false;
                // Account isn't created yet — an OTP was emailed. Switch the
                // Register page into its verification step.
                state.pendingVerificationEmail = action.payload.email;
            })
            .addCase(register.rejected, (state, action) => {
                state.isLoading = false;
                state.isError = true;
                state.message = action.payload ?? "An error occurred";
                state.user = null;
            })
            .addCase(verifyOtp.pending, (state) => { state.isLoading = true; })
            .addCase(verifyOtp.fulfilled, (state, action) => {
                state.isLoading = false;
                state.isSuccess = true;
                state.user = action.payload;
                state.isAuthenticated = true;
                state.pendingVerificationEmail = null;
            })
            .addCase(verifyOtp.rejected, (state, action) => {
                state.isLoading = false;
                state.isError = true;
                state.message = action.payload ?? "Verification failed";
            })
            .addCase(resendOtp.rejected, (state, action) => {
                state.isError = true;
                state.message = action.payload ?? "Could not resend the code";
            })
            .addCase(updateProfile.pending, (state) => {
                state.isLoading = true;
                state.isProfileLoading = true;
            })
            .addCase(updateProfile.fulfilled, (state, action) => {
                state.isLoading = false;
                state.isSuccess = true;
                state.user = action.payload;
                state.isProfileLoading = false;
            })
            .addCase(updateProfile.rejected, (state, action) => {
                state.isLoading = false;
                state.isError = true;
                state.message = action.payload ?? "An error occurred";
                state.isProfileLoading = false;
            })
            .addCase(uploadAvatar.pending, (state) => {
                state.isAvatarUploading = true;
            })
            .addCase(uploadAvatar.fulfilled, (state, action) => {
                state.isAvatarUploading = false;
                state.user = action.payload;
            })
            .addCase(uploadAvatar.rejected, (state) => {
                state.isAvatarUploading = false;
            })
            .addCase(login.pending, (state) => { state.isLoading = true; })
            .addCase(login.fulfilled, (state, action) => {
                state.isLoading = false;
                state.isSuccess = true;
                state.user = action.payload;
                state.isAuthenticated = true;
            })
            .addCase(login.rejected, (state, action) => {
                state.isLoading = false;
                state.isError = true;
                state.message = action.payload ?? "An error occurred";
                state.user = null;
            })
            .addCase(googleLogin.pending, (state) => { state.isLoading = true; })
            .addCase(googleLogin.fulfilled, (state, action) => {
                state.isLoading = false;
                state.isSuccess = true;
                state.user = action.payload;
                state.isAuthenticated = true;
            })
            .addCase(googleLogin.rejected, (state, action) => {
                state.isLoading = false;
                state.isError = true;
                state.message = action.payload ?? "An error occurred";
                state.user = null;
            })
            .addCase(logout.pending, (state) => { state.isLoading = true; })
            .addCase(logout.fulfilled, (state) => {
                state.isLoading = false;
                state.isSuccess = false;
                state.user = null;
                state.isAuthenticated = false;
            })
            .addCase(logout.rejected, (state, action) => {
                state.isLoading = false;
                state.isError = true;
                state.message = action.payload ?? "An error occurred";
            });
    },
});

export const { reset, clearPendingVerification } = authSlice.actions;
export default authSlice.reducer;
