import { BRAND } from "../constants/brand";
import { useState, useEffect } from "react";
import type { ChangeEvent, SyntheticEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-toastify";
import { login, reset, googleLogin } from "../features/auth/authSlice";
import type { RootState, AppDispatch } from "../app/store";
import type { User } from "../types/user";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import PasswordInput from "../components/PasswordInput";
import { googleLoginConfigured } from "../services/googleLoginConfig";

const Login = () => {
    const [formData, setFormData] = useState({
        email: "",
        password: "",
    });

    const { email, password } = formData;

    const navigate = useNavigate();
    const dispatch = useDispatch<AppDispatch>();
    const { user, isLoading, isError, isSuccess, message } = useSelector((state: RootState) => state.auth);

    useEffect(() => {
        dispatch(reset());
    }, [dispatch]);

    useEffect(() => {
        if (isError) {
            toast.error(message || "Invalid email or password");
            dispatch(reset());
        }

        if (isSuccess && user) {
            toast.success("Login successful");
            navigate("/dashboard");
            dispatch(reset());
        }
    }, [user, isError, isSuccess, message, navigate, dispatch]);

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        setFormData((prevState) => ({
            ...prevState,
            [e.target.name]: e.target.value,
        }));
    };

    const handleSubmit = (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        dispatch(login(formData as unknown as User));
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

    return (
        <div className="flex flex-col justify-center items-center min-h-[85vh] py-12 px-4">
            <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="glass-card rounded-[2.5rem] p-10 relative overflow-hidden">
                    {/* Decorative element */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary-500/10 blur-3xl -mr-16 -mt-16"></div>
                    
                    <div className="text-center mb-8 relative z-10">
                        <h2 className="text-4xl font-extrabold tracking-tight mb-3">
                            Welcome <span className="text-gradient">Back</span>
                        </h2>
                        <p className="text-surface-400 text-sm font-medium">Sign in to your {BRAND.name} account</p>
                    </div>

                    {googleLoginConfigured&&<div className="w-full flex items-center justify-center relative z-10">
                        <GoogleLogin
                            onSuccess={handleGoogleSuccess}
                            onError={() => {
                                toast.error("Google Login Failed");
                            }}
                            theme="filled_black"
                            shape="pill"
                            size="large"
                            text="continue_with"
                            width={280}
                        />
                    </div>}{!googleLoginConfigured&&import.meta.env.DEV&&<p className="mb-4 text-center text-xs text-surface-500">Google sign-in is not configured. Use email and password.</p>}

                    <div className="my-8 flex items-center relative z-10">
                        <div className="grow border-t border-white/5"></div>
                        <div className="mx-4 text-surface-500 text-[10px] font-black tracking-[0.2em] uppercase">Or log in with email</div>
                        <div className="grow border-t border-white/5"></div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
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
                        <div className="space-y-2">
                            <label htmlFor="password" className="text-[11px] font-black uppercase tracking-widest text-surface-500 ml-1">Password</label>
                            <PasswordInput
                                id="password"
                                name="password"
                                value={password}
                                onChange={handleChange}
                                required
                            />
                            <div className="text-right">
                                <Link
                                    to="/forgot-password"
                                    className="text-[11px] font-bold text-surface-400 hover:text-primary-400 transition-colors underline underline-offset-4"
                                >
                                    Forgot password?
                                </Link>
                            </div>
                        </div>
                        <button
                            type="submit"
                            className="btn-primary w-full text-sm uppercase tracking-widest font-black"
                        >
                            Log In
                        </button>
                    </form>

                    <div className="mt-8 text-center relative z-10">
                        <p className="text-surface-400 text-sm font-medium">
                            New here?{" "}
                            <Link to="/register" className="text-primary-400 hover:text-primary-300 font-bold underline underline-offset-4 transition-colors">Create account</Link>
                        </p>
                    </div>
                </div>

                {/* Footer text */}
                <p className="mt-8 text-center text-surface-500 text-[10px] font-bold uppercase tracking-widest">
                    &copy; {new Date().getFullYear()} {BRAND.name}. Built for the next generation of talent.
                </p>
            </div>
        </div>
    );
}

export default Login
