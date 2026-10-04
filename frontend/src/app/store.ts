import { configureStore } from "@reduxjs/toolkit";
import authReducer from "../features/auth/authSlice";
import sessionReducer from "../features/session/sessionSlice";
import analyticsReducer from "../features/analytics/analyticsSlice";
import gamificationReducer from "../features/gamification/gamificationSlice";

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

export const store = configureStore({
    reducer: {
        auth: authReducer,
        session: sessionReducer,
        analytics: analyticsReducer,
        gamification: gamificationReducer,
    },
    devTools: import.meta.env.MODE !== "production",
});