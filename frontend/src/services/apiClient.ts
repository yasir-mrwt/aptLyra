import axios from "axios";
import { editorialQueryCache, QuerySupersededError } from "./editorialQueryCache";
import { setupInterceptors } from "./axiosSetup";

/**
 * Unified global Axios instance.
 * Automatically handles Refresh Token Rotation and standardized error formatting.
 */
const apiClient = axios.create({
    baseURL: import.meta.env.VITE_API_URL || "http://localhost:5002/api",
    withCredentials: true,
});

// Cache only route summaries. Auth checks, active sessions and job polling always
// reach the server. Entries live in memory and disappear on hard reload.
const adapter = axios.getAdapter(apiClient.defaults.adapter);
const account = () => { try { const user = JSON.parse(localStorage.getItem("user") || "null"); return user?._id || user?.id || null; } catch { return null; } };
apiClient.defaults.adapter = async config => {
    const identity = account();
    Object.assign(config,{_aptlyraAccount:identity});
    editorialQueryCache.setIdentity(identity);
    const path = (config.url || "").split("?")[0].replace(/\/$/, "");
    const cacheable = config.method === "get" && identity && ["/content-intelligence/submissions", "/analytics", "/gamification/profile", "/gamification/leaderboard", "/gamification/activity", "/sessions", "/resume", "/interview-plans/capabilities"].includes(path);
    const fetch = async () => {
        const response = await adapter(config);
        if (identity !== account()) throw new axios.CanceledError("Account changed");
        return response;
    };
    if (cacheable) {
        const key = `http:${config.url}:${JSON.stringify(config.params || {})}`;
        try {
            const response = await editorialQueryCache.load(key, fetch, {allowStaleOnError:false});
            return { ...response!, config };
        } catch(error) {
            // A successful mutation/worker event can supersede an in-flight read.
            // Retry once under the same account; never reuse its stale response.
            if(!(error instanceof QuerySupersededError) || identity!==account())throw error;
            const response=await editorialQueryCache.load(key,fetch,{force:true,allowStaleOnError:false});
            return {...response!,config};
        }
    }
    const response = await fetch();
    if (config.method !== "get") {
        // Unrelated profile/editorial writes do not change activity ranking. Worker
        // completion/reconnect events still invalidate all HTTP summaries.
        const affectsXP = path.startsWith("/gamification/") || path.startsWith("/sessions");
        editorialQueryCache.invalidatePrefix("http:", affectsXP ? [] : ["http:/gamification/leaderboard:"]);
        if(path.startsWith("/content-intelligence/"))editorialQueryCache.invalidatePrefix("editorial:");
    }
    return response;
};
setupInterceptors(apiClient);

export default apiClient;
