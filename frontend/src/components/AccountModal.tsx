import { useState, useEffect, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import { logout, updateProfile, uploadAvatar, reset } from "../features/auth/authSlice";
import { useNavigate } from "react-router-dom";
import type { RootState, AppDispatch } from "../app/store";
import { X, LogOut, User, Mail, Save, Lock, Camera } from "lucide-react";
import { motion } from "framer-motion";
import { ROLES } from "../constants/interview";
import CustomSelect from "./CustomSelect";
import { toast } from "react-toastify";

const initialsOf = (name?: string) =>
    (name || "?")
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]!.toUpperCase())
        .join("");

const GoogleG = () => (
    <svg viewBox="0 0 24 24" className="w-3 h-3">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18A10.97 10.97 0 0 0 1 12c0 1.77.42 3.45 1.18 4.94l3.66-2.84z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
    </svg>
);

const AccountModal = ({ onClose }: { onClose: () => void }) => {
    const { user, isProfileLoading, isAvatarUploading } = useSelector((state: RootState) => state.auth);
    const dispatch = useDispatch<AppDispatch>();
    const navigate = useNavigate();
    const avatarInputRef = useRef<HTMLInputElement>(null);

    const handleAvatarPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = ""; // allow re-picking the same file
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            toast.error("Please choose an image file");
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            toast.error("Image must be under 5MB");
            return;
        }
        try {
            await dispatch(uploadAvatar(file)).unwrap();
            toast.success("Profile photo updated");
        } catch (err: unknown) {
            toast.error(typeof err === "string" ? err : "Photo upload failed");
        }
    };

    const [formData, setFormData] = useState({
        name: user?.name || "",
        preferredRole: user?.preferredRole || "",
    });

    // Lock background scroll while modal is open
    useEffect(() => {
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = "";
        };
    }, []);

    const onLogout = () => {
        dispatch(logout());
        dispatch(reset());
        onClose();
        navigate('/');
    };

    const handleRoleChange = (name: string, value: string | number) => {
        setFormData(prev => ({ ...prev, [name]: String(value) }));
    };

    const handleSave = async () => {
        if (!user) return;

        if (formData.name === user.name && formData.preferredRole === user.preferredRole) {
            toast.info("No changes detected");
            return;
        }

        try {
            await dispatch(updateProfile({ ...user, ...formData })).unwrap();
            toast.success("Profile updated");
            dispatch(reset());
        } catch (error: unknown) {
            const errorMessage = (error as { message?: string })?.message || "Something went wrong";
            toast.error(errorMessage);
            dispatch(reset());
        }
    };

    const isGoogle = user?.provider === "google";

    return (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="absolute inset-0 bg-surface-950/60 backdrop-blur-md"
            />

            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-md glass-card rounded-[2rem] overflow-visible shadow-2xl border border-white/5"
            >
                {/* ── Identity header ── */}
                <div className="relative px-7 pt-7 pb-6 border-b border-white/5 overflow-hidden rounded-t-[2rem]">
                    <div className="absolute -top-20 -right-12 w-56 h-56 bg-primary-500/10 blur-3xl pointer-events-none" />
                    <div className="absolute -bottom-24 -left-16 w-48 h-48 bg-primary-500/5 blur-3xl pointer-events-none" />

                    <button
                        onClick={onClose}
                        className="absolute top-5 right-5 p-2 text-surface-500 hover:text-white transition-colors rounded-xl hover:bg-white/5 cursor-pointer z-20"
                    >
                        <X size={18} />
                    </button>

                    <div className="flex items-center gap-4 relative z-10">
                        {/* Avatar — click to change photo (Cloudinary) */}
                        <input
                            ref={avatarInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleAvatarPick}
                        />
                        <button
                            type="button"
                            onClick={() => !isAvatarUploading && avatarInputRef.current?.click()}
                            className="relative shrink-0 group/avatar cursor-pointer rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50"
                            title="Change profile photo"
                        >
                            {user?.avatarUrl ? (
                                <img
                                    src={user.avatarUrl}
                                    alt={user.name}
                                    referrerPolicy="no-referrer"
                                    className="w-16 h-16 rounded-2xl object-cover border border-white/10 shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
                                />
                            ) : (
                                <div className="w-16 h-16 rounded-2xl bg-linear-to-br from-primary-500/40 to-primary-500/10 border border-primary-500/30 flex items-center justify-center text-xl font-black text-white font-display shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
                                    {initialsOf(user?.name)}
                                </div>
                            )}
                            {/* Hover / uploading overlay */}
                            <span className={`absolute inset-0 rounded-2xl bg-black/55 backdrop-blur-[2px] flex flex-col items-center justify-center gap-0.5 transition-opacity duration-200 ${isAvatarUploading ? "opacity-100" : "opacity-0 group-hover/avatar:opacity-100"}`}>
                                {isAvatarUploading ? (
                                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <>
                                        <Camera size={16} className="text-white" />
                                        <span className="text-[8px] font-black uppercase tracking-widest text-white/90">Change</span>
                                    </>
                                )}
                            </span>
                        </button>

                        <div className="min-w-0">
                            <h1 className="text-lg font-black text-white truncate font-display tracking-tight">{user?.name}</h1>
                            <p className="text-xs text-surface-400 font-medium truncate mt-0.5">{user?.email}</p>
                            <span className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-surface-300">
                                {isGoogle ? <GoogleG /> : <Mail size={10} className="text-primary-400" />}
                                {isGoogle ? "Google Account" : "Email Account"}
                            </span>
                        </div>
                    </div>
                </div>

                {/* ── Content ── */}
                <div className="p-7 space-y-6">
                    {/* Name Input */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-surface-400 uppercase tracking-widest ml-1">Full Name</label>
                        <div className="relative group">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-surface-600 group-focus-within:text-primary-400 transition-colors">
                                <User size={16} />
                            </div>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
                                className="glass-input h-12 pl-12 text-sm font-bold w-full"
                                placeholder="Enter your name"
                            />
                        </div>
                    </div>

                    {/* Email (locked) */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between ml-1 mr-1">
                            <label className="text-[10px] font-black text-surface-400 uppercase tracking-widest">Email</label>
                            <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-surface-500">
                                <Lock size={9} /> Locked
                            </span>
                        </div>
                        <div className="relative">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-surface-500">
                                <Mail size={16} />
                            </div>
                            <div className="glass-input h-12 pl-12 pr-4 flex items-center text-sm font-bold text-surface-400 bg-white/2 cursor-not-allowed truncate">
                                {user?.email}
                            </div>
                        </div>
                    </div>

                    {/* Role Selection */}
                    <div className="z-50">
                        <CustomSelect
                            label="Preferred Role"
                            name="preferredRole"
                            value={formData.preferredRole}
                            options={ROLES}
                            onChange={handleRoleChange}
                        />
                    </div>

                    {/* Save */}
                    <button
                        onClick={handleSave}
                        disabled={isProfileLoading}
                        className={`w-full h-12 rounded-2xl flex items-center justify-center gap-2 font-black text-[11px] uppercase tracking-widest transition-all active:scale-[0.98] ${isProfileLoading ? 'bg-surface-800 text-surface-500 cursor-wait' : 'btn-primary py-0! px-0!'}`}
                    >
                        <Save size={14} />
                        {isProfileLoading ? 'Saving…' : 'Save Changes'}
                    </button>

                    {/* Logout */}
                    <div className="pt-1 border-t border-white/5">
                        <button
                            onClick={onLogout}
                            className="mt-4 w-full h-11 rounded-2xl border border-rose-500/25 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 hover:text-rose-200 flex items-center justify-center gap-2 font-black text-[11px] uppercase tracking-widest transition-all active:scale-[0.98] cursor-pointer group"
                        >
                            <LogOut size={14} className="group-hover:translate-x-0.5 transition-transform" />
                            Log Out
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default AccountModal;
