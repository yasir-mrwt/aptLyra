import { AxiosError } from "axios";

/**
 * Standardizes error extracting from Axios responses for catch blocks in Async Thunks.
 * @param error The unknown error caught in the try/catch block.
 * @returns A string representation of the error message.
 */
export const handleThunkError = (error: unknown): string => {
    const axiosError = error as AxiosError<{ message: string }>;
    const message = axiosError.response?.data?.message || axiosError.message || String(error);
    return message;
};
