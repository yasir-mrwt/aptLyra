import { useState, useRef, useEffect } from "react";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import { logout } from "../../features/auth/authSlice";
import type { AppDispatch } from "../../app/store";

interface ProfileUser {
  name: string;
  email?: string;
  avatarUrl?: string;
  provider?: string;
}

interface UserProfileMenuProps {
  user: ProfileUser;
  onOpenModal: () => void;
}

/** Google photo when available, otherwise premium gradient initials. */
export const ProfileAvatar = ({ user, size = 32 }: { user: ProfileUser; size?: number }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const initials = (user.name || "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (user.avatarUrl && !imgFailed) {
    return (
      <img
        src={user.avatarUrl}
        alt={user.name}
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className="rounded-full object-cover ring-2 ring-white/15"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className="rounded-full bg-gradient-to-br from-violet-400 to-violet-700 text-white font-black flex items-center justify-center ring-2 ring-white/15 shadow-[0_0_16px_rgba(139,92,246,0.25)]"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  );
};

const GoogleG = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l-.02.15 3.5 2.7.24.02c2.2-2 3.5-5 3.5-8.6z" />
    <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.7-2.9c-1 .7-2.4 1.2-4.2 1.2-3.2 0-5.9-2.1-6.8-5l-.14.01-3.6 2.8-.05.13C3.3 21.3 7.3 24 12 24z" />
    <path fill="#FBBC05" d="M5.2 14.4c-.3-.7-.4-1.5-.4-2.4 0-.8.2-1.6.4-2.4l-.01-.16-3.7-2.8-.12.06C.5 8.2 0 10 0 12s.5 3.8 1.4 5.3l3.8-2.9z" />
    <path fill="#EB4335" d="M12 4.6c2.3 0 3.8 1 4.7 1.8l3.4-3.3C18 1.2 15.2 0 12 0 7.3 0 3.3 2.7 1.4 6.7l3.8 2.9c.9-2.9 3.6-5 6.8-5z" />
  </svg>
);

export const UserProfileMenu = ({ user, onOpenModal }: UserProfileMenuProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  const handleLogout = async () => {
    setIsOpen(false);
    await dispatch(logout());
    navigate("/");
  };

  const isGoogle = user.provider === "google" || Boolean(user.avatarUrl);

  return (
    <div className="relative" ref={menuRef}>
      {/* Chip — avatar + name + status */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] backdrop-blur-xl pl-1.5 pr-4 py-1.5 hover:border-white/25 hover:bg-white/[0.07] transition-all duration-300 group cursor-pointer shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
      >
        <div className="relative">
          <ProfileAvatar user={user} size={30} />
          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full ring-2 ring-surface-950"></span>
        </div>
        <span className="text-[10px] font-black uppercase tracking-widest text-surface-200 group-hover:text-white transition-colors">
          {user.name.split(" ")[0]}
        </span>
        <svg
          width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
          className={`text-surface-500 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Dropdown — identity card + actions */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-3 w-72 rounded-3xl border border-white/10 bg-surface-800/95 backdrop-blur-2xl shadow-2xl shadow-black/70 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Identity header */}
          <div className="relative px-6 pt-6 pb-5">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-full"
              style={{ background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(139,92,246,0.12), transparent 70%)" }}
            />
            <div className="relative flex items-center gap-4">
              <ProfileAvatar user={user} size={52} />
              <div className="min-w-0">
                <p className="text-white font-black text-sm truncate">{user.name}</p>
                {user.email && (
                  <p className="text-surface-500 text-xs truncate mt-0.5">{user.email}</p>
                )}
                <span className="inline-flex items-center gap-1.5 mt-2 text-[9px] font-black uppercase tracking-[0.15em] text-surface-300 bg-white/5 border border-white/10 px-2.5 py-1 rounded-full">
                  {isGoogle ? (
                    <>
                      <GoogleG size={10} /> Google Account
                    </>
                  ) : (
                    <>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" />
                      </svg>
                      Email Account
                    </>
                  )}
                </span>
              </div>
            </div>
          </div>

          <div className="h-px bg-white/5 mx-4"></div>

          {/* Actions */}
          <div className="p-2 space-y-1">
            <button
              onClick={() => { setIsOpen(false); onOpenModal(); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left hover:bg-white/5 transition-colors cursor-pointer group/item"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 border border-white/10 text-surface-300 group-hover/item:bg-primary-500/15 group-hover/item:border-primary-500/30 group-hover/item:text-primary-300 transition-colors">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                </svg>
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-bold text-surface-200 group-hover/item:text-white transition-colors">Account Settings</span>
                <span className="block text-[10px] text-surface-500 font-medium">Name, role &amp; preferences</span>
              </span>
            </button>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left hover:bg-rose-500/10 transition-colors cursor-pointer group/item"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 group-hover/item:bg-rose-500/20 group-hover/item:text-rose-300 transition-colors">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-bold text-rose-300 group-hover/item:text-rose-200 transition-colors">Log Out</span>
                <span className="block text-[10px] text-rose-400/50 font-medium">End this session</span>
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
