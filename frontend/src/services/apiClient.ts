import axios from "axios";
import { setupInterceptors } from "./axiosSetup";

/**
 * Unified global Axios instance.
 * Automatically handles Refresh Token Rotation and standardized error formatting.
 */
const apiClient = axios.create({
    baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
    withCredentials: true,
});

setupInterceptors(apiClient);

export default apiClient;
