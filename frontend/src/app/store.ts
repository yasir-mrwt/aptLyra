import { configureStore, combineReducers, type UnknownAction } from "@reduxjs/toolkit";
import authReducer from "../features/auth/authSlice";
import sessionReducer from "../features/session/sessionSlice";
import analyticsReducer from "../features/analytics/analyticsSlice";
import gamificationReducer from "../features/gamification/gamificationSlice";
import { roleReducer } from "../features/auth/roleSlice";
import { editorialQueryCache } from "../services/editorialQueryCache";

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

const reducers = combineReducers({auth:authReducer,session:sessionReducer,analytics:analyticsReducer,gamification:gamificationReducer,role:roleReducer});
export const store = configureStore({
    reducer: (state: ReturnType<typeof reducers> | undefined, action: UnknownAction) => {
        const next = reducers(state, action);
        const previousId = state?.auth.user?._id || state?.auth.user?.id;
        const nextId = next.auth.user?._id || next.auth.user?.id;
        if (state && previousId !== nextId) return {...reducers(undefined, {type:"account/reset"}),auth:next.auth};
        return next;
    },
    devTools: import.meta.env.MODE !== "production",
});

store.subscribe(() => {
    const user = store.getState().auth.user;
    editorialQueryCache.setIdentity(user?._id || user?.id || null);
});
