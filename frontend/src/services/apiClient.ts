import axios from "axios";
import { editorialQueryCache } from "./editorialQueryCache";
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
    editorialQueryCache.setIdentity(identity);
    const path = (config.url || "").split("?")[0].replace(/\/$/, "");
    const cacheable = config.method === "get" && identity && ["/analytics", "/gamification/profile", "/gamification/activity", "/sessions", "/resume", "/interview-plans/capabilities"].includes(path);
    const fetch = async () => {
        const response = await adapter(config);
        if (identity !== account()) throw new axios.CanceledError("Account changed");
        return response;
    };
    if (cacheable) {
        const key = `http:${config.url}:${JSON.stringify(config.params || {})}`;
        const response = await editorialQueryCache.load(key, fetch, {allowStaleOnError:false});
        return { ...response!, config };
    }
    const response = await fetch();
    if (config.method !== "get") editorialQueryCache.invalidatePrefix("http:");
    return response;
};
setupInterceptors(apiClient);

export default apiClient;
