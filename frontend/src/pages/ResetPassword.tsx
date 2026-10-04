import { useState } from "react";
import type { SyntheticEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import axios from "axios";
import apiClient from "../services/apiClient";
import PasswordInput from "../components/PasswordInput";

const ResetPassword = () => {
    const [searchParams] = useSearchParams();
    const token = searchParams.get("token") || "";

    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();

    const onSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();

        if (password !== confirmPassword) {
            toast.error("Passwords do not match");
            return;
        }
        if (password.length < 6) {
            toast.error("Password must be at least 6 characters long");
            return;
        }

        setIsLoading(true);
        try {
            await apiClient.post("user/reset-password", { token, password });
            toast.success("Password reset! Please log in with your new password.");
            navigate("/login");
        } catch (error: unknown) {
            const message = axios.isAxiosError(error)
                ? error.response?.data?.message ?? error.message
                : String(error);
            toast.error(message);
        } finally {
            setIsLoading(false);
        }
    };

    if (!token) {
        return (
            <div className="flex flex-col justify-center items-center min-h-[85vh] py-12 px-4">
                <div className="w-full max-w-md glass-card rounded-[2.5rem] p-10 text-center">
                    <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                        <span className="text-2xl">⚠️</span>
                    </div>
                    <h2 className="text-2xl font-extrabold tracking-tight mb-3">Invalid Reset Link</h2>
                    <p className="text-surface-400 text-sm font-medium mb-8">
                        This link is missing its token. Please request a new one.
                    </p>
                    <Link to="/forgot-password" className="btn-primary inline-block text-sm uppercase tracking-widest font-black">
                        Request New Link
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col justify-center items-center min-h-[85vh] py-12 px-4">
            <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="glass-card rounded-[2.5rem] p-10 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-32 h-32 bg-primary-500/10 blur-3xl -ml-16 -mt-16"></div>

                    <div className="text-center mb-10 relative z-10">
                        <h2 className="text-3xl font-extrabold tracking-tight mb-3">
                            Set a New <span className="text-gradient">Password</span>
                        </h2>
                        <p className="text-surface-400 text-sm font-medium">
                            Choose something strong — all your other sessions will be signed out.
                        </p>
                    </div>

                    <form onSubmit={onSubmit} className="space-y-6 relative z-10">
                        <div className="space-y-2">
                            <label htmlFor="password" className="text-[11px] font-black uppercase tracking-widest text-surface-500 ml-1">New Password</label>
                            <PasswordInput
                                id="password"
                                name="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="confirmPassword" className="text-[11px] font-black uppercase tracking-widest text-surface-500 ml-1">Confirm Password</label>
                            <PasswordInput
                                id="confirmPassword"
                                name="confirmPassword"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="btn-primary w-full text-sm uppercase tracking-widest font-black disabled:opacity-50"
                        >
                            {isLoading ? "Resetting..." : "Reset Password"}
                        </button>
                    </form>

                    <div className="mt-10 text-center relative z-10">
                        <p className="text-surface-400 text-sm font-medium">
                            <Link to="/login" className="text-primary-400 hover:text-primary-300 font-bold underline underline-offset-4 transition-colors">Back to Login</Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ResetPassword;
