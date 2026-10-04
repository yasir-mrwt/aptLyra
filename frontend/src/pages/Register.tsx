import { useState, useEffect, useRef } from "react";
import type { ChangeEvent, SyntheticEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { googleLogin, register, verifyOtp, resendOtp, clearPendingVerification, reset } from "../features/auth/authSlice";
import type { AppDispatch, RootState } from "../app/store";
import { toast } from "react-toastify";
import type { User } from "../types/user";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import PasswordInput from "../components/PasswordInput";

const RESEND_COOLDOWN = 60;

const Register = () => {
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        password: "",
        confirmPassword: "",
    });
    const [otp, setOtp] = useState("");
    const [resendIn, setResendIn] = useState(0);
    const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const { name, email, password, confirmPassword } = formData;

    const navigate = useNavigate();
    const dispatch = useDispatch<AppDispatch>();

    const { user, isLoading, isError, isSuccess, message, pendingVerificationEmail } = useSelector(
        (state: RootState) => state.auth
    );

    useEffect(() => {
        dispatch(reset());
    }, [dispatch]);

    useEffect(() => {
        if (isError) {
            toast.error(message || "An error occurred");
            dispatch(reset());
        }

        if (isSuccess) {
            toast.success("Registration successful");
            navigate("/dashboard");
            dispatch(reset())
        }

        if (user && !isSuccess) {
            navigate("/dashboard");
        }

    }, [user, isError, isSuccess, message, navigate, dispatch]);

    // Countdown for the resend button
    useEffect(() => {
        if (resendIn <= 0) return;
        cooldownRef.current = setInterval(() => {
            setResendIn((s) => (s <= 1 ? 0 : s - 1));
        }, 1000);
        return () => {
            if (cooldownRef.current) clearInterval(cooldownRef.current);
        };
    }, [resendIn > 0]);

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        setFormData((prevState) => ({
            ...prevState,
            [e.target.name]: e.target.value,
        }));
    };

    const onSubmit = (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();

        if (password !== confirmPassword) {
            toast.error("Passwords do not match");
        } else {
            const userData = {
                name,
                email,
                password,
            } as unknown as User;
            dispatch(register(userData))
                .unwrap()
                .then(() => {
                    toast.info("Verification code sent to your email 📧");
                    setResendIn(RESEND_COOLDOWN);
                })
                .catch(() => { /* handled by the isError effect */ });
        }
    };

    const onVerifyOtp = (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!pendingVerificationEmail) return;
        if (otp.trim().length !== 6) {
            toast.error("Please enter the 6-digit code");
            return;
        }
        dispatch(verifyOtp({ email: pendingVerificationEmail, otp: otp.trim() }));
    };

    const onResendOtp = () => {
        if (!pendingVerificationEmail || resendIn > 0) return;
        dispatch(resendOtp(pendingVerificationEmail))
            .unwrap()
            .then(() => {
                toast.info("A new code is on its way 📧");
                setResendIn(RESEND_COOLDOWN);
            })
            .catch(() => { /* handled by the isError effect */ });
    };

    const handleGoogleSuccess = (credentialResponse: CredentialResponse) => {
        if (credentialResponse.credential) {
            dispatch(googleLogin(credentialResponse.credential));
        } else {
            toast.error("Google Login Failed");
        }
    };

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-violet-500"></div>
            </div>);
    }

    // ── Step 2: OTP verification ──
    if (pendingVerificationEmail) {
        return (
            <div className="flex flex-col justify-center items-center min-h-[85vh] py-12 px-4">
                <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-8 duration-700">
                    <div className="glass-card rounded-[2.5rem] p-10 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-32 h-32 bg-primary-500/10 blur-3xl -ml-16 -mt-16"></div>

                        <div className="text-center mb-10 relative z-10">
                            <div className="w-16 h-16 bg-primary-500/10 border border-primary-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                                <span className="text-2xl">📧</span>
                            </div>
                            <h2 className="text-3xl font-extrabold tracking-tight mb-3">
                                Check your <span className="text-gradient">Inbox</span>
                            </h2>
                            <p className="text-surface-400 text-sm font-medium">
                                We sent a 6-digit code to<br />
                                <span className="text-white font-bold">{pendingVerificationEmail}</span>
                            </p>
                        </div>

                        <form onSubmit={onVerifyOtp} className="space-y-6 relative z-10">
                            <input
                                type="text"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                maxLength={6}
                                value={otp}
                                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                                className="glass-input text-center text-3xl font-black tracking-[0.6em] py-4"
                                placeholder="••••••"
                                autoFocus
                                required
                            />
                            <button
                                type="submit"
                                className="btn-primary w-full text-sm uppercase tracking-widest font-black"
                            >
                                Verify & Create Account
                            </button>
                        </form>

                        <div className="mt-8 text-center space-y-4 relative z-10">
                            <button
                                onClick={onResendOtp}
                                disabled={resendIn > 0}
                                className="text-primary-400 hover:text-primary-300 font-bold text-sm underline underline-offset-4 transition-colors disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed cursor-pointer"
                            >
                                {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
                            </button>
                            <p>
                                <button
                                    onClick={() => { setOtp(""); dispatch(clearPendingVerification()); }}
                                    className="text-surface-500 hover:text-white text-xs font-bold uppercase tracking-widest transition-colors cursor-pointer"
                                >
                                    ← Change details
                                </button>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ── Step 1: Registration form ──
    return (
        <div className="flex flex-col justify-center items-center min-h-[85vh] py-12 px-4">
            <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="glass-card rounded-[2.5rem] p-10 relative overflow-hidden">
                    {/* Decorative element */}
                    <div className="absolute top-0 left-0 w-32 h-32 bg-indigo-500/10 blur-3xl -ml-16 -mt-16"></div>

                    <div className="text-center mb-8 relative z-10">
                        <h2 className="text-4xl font-extrabold tracking-tight mb-3">
                            Get <span className="text-gradient">Started</span>
                        </h2>
                        <p className="text-surface-400 text-sm font-medium">Join the next generation of top talent</p>
                    </div>

                    <div className="w-full flex items-center justify-center relative z-10">
                        <GoogleLogin
                            onSuccess={handleGoogleSuccess}
                            onError={() => {
                                toast.error("Google Login Failed");
                            }}
                            theme="filled_black"
                            shape="pill"
                            size="large"
                            text="continue_with"
                            width="100%"
                        />
                    </div>

                    <div className="my-8 flex items-center relative z-10">
                        <div className="grow border-t border-white/5"></div>
                        <div className="mx-4 text-surface-500 text-[10px] font-black tracking-[0.2em] uppercase">Or sign up with email</div>
                        <div className="grow border-t border-white/5"></div>
                    </div>

                    <form className="grid grid-cols-1 gap-5 relative z-10" onSubmit={onSubmit}>
                        <div className="space-y-2">
                            <label htmlFor="name" className="text-[11px] font-black uppercase tracking-widest text-surface-500 ml-1">Full Name</label>
                            <input
                                type="text"
                                id="name"
                                name="name"
                                value={name}
                                onChange={handleChange}
                                className="glass-input"
                                placeholder="John Doe"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="email" className="text-[11px] font-black uppercase tracking-widest text-surface-500 ml-1">Email Address</label>
                            <input
                                type="email"
                                id="email"
                                name="email"
                                value={email}
                                onChange={handleChange}
                                className="glass-input"
                                placeholder="name@company.com"
                                required
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label htmlFor="password" className="text-[11px] font-black uppercase tracking-widest text-surface-500 ml-1">Password</label>
                                <PasswordInput
                                    id="password"
                                    name="password"
                                    value={password}
                                    onChange={handleChange}
                                    className="py-3! px-4!"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <label htmlFor="confirmPassword" className="text-[11px] font-black uppercase tracking-widest text-surface-500 ml-1">Confirm</label>
                                <PasswordInput
                                    id="confirmPassword"
                                    name="confirmPassword"
                                    value={confirmPassword}
                                    onChange={handleChange}
                                    className="py-3! px-4!"
                                    required
                                />
                            </div>
                        </div>
                        <button
                            type="submit"
                            className="btn-primary w-full text-sm uppercase tracking-widest font-black mt-2"
                        >
                            Create Account
                        </button>
                    </form>

                    <div className="mt-8 text-center relative z-10">
                        <p className="text-surface-400 text-sm font-medium">
                            Already a member?{" "}
                            <Link to="/login" className="text-primary-400 hover:text-primary-300 font-bold underline underline-offset-4 transition-colors">Log In</Link>
                        </p>
                    </div>
                </div>

                <p className="mt-8 text-center text-surface-500 text-[10px] font-bold uppercase tracking-widest">
                    &copy; {new Date().getFullYear()} TechVera AI. The smart way to interview.
                </p>
            </div>
        </div>
    );
}

export default Register
