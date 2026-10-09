import { configureStore } from "@reduxjs/toolkit";
import authReducer from "../features/auth/authSlice";
import sessionReducer from "../features/session/sessionSlice";
import analyticsReducer from "../features/analytics/analyticsSlice";
import gamificationReducer from "../features/gamification/gamificationSlice";
import { roleReducer } from "../features/auth/roleSlice";
import { editorialQueryCache } from "../services/editorialQueryCache";

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

export const store = configureStore({
    reducer: {
        auth: authReducer,
        session: sessionReducer,
        analytics: analyticsReducer,
        gamification: gamificationReducer,
        role: roleReducer,
    },
    devTools: import.meta.env.MODE !== "production",
});

let wasAuthenticated = Boolean((store.getState() as { auth: { user?: unknown } }).auth.user);
store.subscribe(() => {
    const isAuthenticated = Boolean((store.getState() as { auth: { user?: unknown } }).auth.user);
    if (wasAuthenticated && !isAuthenticated) editorialQueryCache.clear();
    wasAuthenticated = isAuthenticated;
});
