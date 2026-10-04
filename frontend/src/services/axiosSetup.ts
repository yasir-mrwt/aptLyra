import axios from "axios";
import type { AxiosInstance } from "axios";

interface FailedRequestQueue {
    resolve: (value?: unknown) => void;
    reject: (reason?: unknown) => void;
}

let isRefreshing = false;
let failedQueue: FailedRequestQueue[] = [];

const processQueue = (error: unknown, token: string | null = null) => {
    failedQueue.forEach((prom) => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve(token);
        }
    });
    failedQueue = [];
};

// A 401 from these endpoints means bad credentials / bad token input —
// NOT an expired session. Refreshing would only add a pointless slow
// roundtrip and surface the wrong error message.
const AUTH_PATHS = ["/user/login", "/user/register", "/user/google", "/user/refresh", "/user/verify-otp", "/user/resend-otp", "/user/forgot-password", "/user/reset-password"];

export const setupInterceptors = (apiInstance: AxiosInstance) => {
    apiInstance.interceptors.response.use(
        (response) => response,
        async (error) => {
            const originalRequest = error.config;
            const isAuthRequest = AUTH_PATHS.some((p) => originalRequest?.url?.includes(p));

            if (error.response?.status === 401 && !originalRequest._retry && !isAuthRequest) {
                if (isRefreshing) {
                    return new Promise(function (resolve, reject) {
                        failedQueue.push({ resolve, reject });
                    })
                        .then(() => {
                            return apiInstance(originalRequest);
                        })
                        .catch((err) => {
                            return Promise.reject(err);
                        });
                }

                originalRequest._retry = true;
                isRefreshing = true;

                try {
                    const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
                    // Call the refresh endpoint. It will automatically use the refresh_jwt cookie
                    // and set the new jwt cookie on success.
                    await axios.post(
                        `${apiUrl}/user/refresh`,
                        {},
                        { withCredentials: true }
                    );

                    isRefreshing = false;
                    processQueue(null, "success");
                    // Notify sockets to reconnect since they might have disconnected due to auth error
                    window.dispatchEvent(new Event("auth_token_refreshed"));
                    return apiInstance(originalRequest);
                } catch (refreshError) {
                    isRefreshing = false;
                    processQueue(refreshError, null);

                    // Refresh failed (token expired/invalid) -> Logout
                    localStorage.removeItem("user");
                    if (window.location.pathname !== "/login") {
                        window.location.href = "/login";
                    }
                    return Promise.reject(refreshError);
                }
            }

            const backendErrorMsg = error.response?.data?.error?.message;
            if (backendErrorMsg) {
                error.message = backendErrorMsg;
            }

            return Promise.reject(error);
        }
    );
};
