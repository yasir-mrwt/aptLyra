import { useState } from "react";
import type { SyntheticEvent } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import axios from "axios";
import apiClient from "../services/apiClient";

const ForgotPassword = () => {
    const [email, setEmail] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [sent, setSent] = useState(false);

    const onSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            await apiClient.post("user/forgot-password", { email });
            setSent(true);
        } catch (error: unknown) {
            const message = axios.isAxiosError(error)
                ? error.response?.data?.message ?? error.message
                : String(error);
            toast.error(message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col justify-center items-center min-h-[85vh] py-12 px-4">
            <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="glass-card rounded-[2.5rem] p-10 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary-500/10 blur-3xl -mr-16 -mt-16"></div>

                    {sent ? (
                        <div className="text-center relative z-10">
                            <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                                <span className="text-2xl">✅</span>
                            </div>
                            <h2 className="text-3xl font-extrabold tracking-tight mb-3">
                                Check your <span className="text-gradient">Inbox</span>
                            </h2>
                            <p className="text-surface-400 text-sm font-medium leading-relaxed mb-8">
                                If an account exists for <span className="text-white font-bold">{email}</span>,
                                a password reset link is on its way. The link expires in 15 minutes.
                            </p>
                            <Link to="/login" className="btn-primary inline-block text-sm uppercase tracking-widest font-black">
                                Back to Login
                            </Link>
                        </div>
                    ) : (
                        <>
                            <div className="text-center mb-10 relative z-10">
                                <h2 className="text-3xl font-extrabold tracking-tight mb-3">
                                    Forgot <span className="text-gradient">Password?</span>
                                </h2>
                                <p className="text-surface-400 text-sm font-medium">
                                    No stress. Enter your email and we'll send you a reset link.
                                </p>
                            </div>

                            <form onSubmit={onSubmit} className="space-y-6 relative z-10">
                                <div className="space-y-2">
                                    <label htmlFor="email" className="text-[11px] font-black uppercase tracking-widest text-surface-500 ml-1">Email Address</label>
                                    <input
                                        type="email"
                                        id="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="glass-input"
                                        placeholder="name@company.com"
                                        autoFocus
                                        required
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="btn-primary w-full text-sm uppercase tracking-widest font-black disabled:opacity-50"
                                >
                                    {isLoading ? "Sending..." : "Send Reset Link"}
                                </button>
                            </form>

                            <div className="mt-10 text-center relative z-10">
                                <p className="text-surface-400 text-sm font-medium">
                                    Remembered it?{" "}
                                    <Link to="/login" className="text-primary-400 hover:text-primary-300 font-bold underline underline-offset-4 transition-colors">Log In</Link>
                                </p>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ForgotPassword;
