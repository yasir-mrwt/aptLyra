import { Link, useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import { logout } from "../../features/auth/authSlice";
import { ProfileAvatar } from "./UserProfileMenu";
import type { AppDispatch } from "../../app/store";
import { roleNavigation,type AppRole } from "../../features/auth/roleSlice";

interface MobileNavProps {
  user: { name: string } | null;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  isActive: (path: string) => boolean;
  onOpenModal: () => void;
  role:AppRole|null;
  roleLoading:boolean;
}

export const MobileNav = ({
  user,
  isOpen,
  onToggle,
  onClose,
  isActive,
  onOpenModal,
  role,
  roleLoading,
}: MobileNavProps) => {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const restrictedLinks=roleNavigation(role);

  const handleLogout = async () => {
    onClose();
    await dispatch(logout());
    navigate("/");
  };

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={onToggle}
        className="md:hidden p-2 rounded-xl bg-white/5 border border-white/10 hover:border-primary-400 transition-all duration-300 cursor-pointer group"
      >
        <div className="w-6 h-6 flex flex-col justify-center items-center space-y-1.5">
          <span
            className={`block w-5 h-0.5 bg-surface-300 transition-all duration-300 ${isOpen ? "rotate-45 translate-y-2" : ""
              }`}
          ></span>
          <span
            className={`block w-5 h-0.5 bg-surface-300 transition-all duration-300 ${isOpen ? "opacity-0" : "opacity-100"
              }`}
          ></span>
          <span
            className={`block w-5 h-0.5 bg-surface-300 transition-all duration-300 ${isOpen ? "-rotate-45 -translate-y-2" : ""
              }`}
          ></span>
        </div>
      </button>

      {/* Mobile Navigation Dropdown */}
      <div
        className={`md:hidden absolute top-full left-0 w-full overflow-hidden transition-all duration-500 ease-in-out ${isOpen ? "max-h-125 border-b border-white/10 shadow-2xl" : "max-h-0"
          }`}
      >
        <div className="bg-surface-900/95 backdrop-blur-2xl px-6 py-8 space-y-6">
          {user ? (
            <>
              <div
                onClick={() => {
                  onOpenModal();
                  onClose();
                }}
                className="flex items-center space-x-4 mb-4 p-4 bg-white/5 rounded-2xl border border-white/5 cursor-pointer hover:bg-white/10 transition-all"
              >
                <div className="relative">
                  <ProfileAvatar user={user} size={38} />
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full ring-2 ring-surface-950"></span>
                </div>
                <span className="text-sm font-black uppercase tracking-[0.2em] text-white">
                  {user.name}
                </span>
              </div>
              <Link
                to="/dashboard"
                onClick={onClose}
                className={`block py-3 text-sm font-black uppercase tracking-[0.2em] transition-colors ${isActive("/dashboard") ? "text-primary-400" : "text-surface-400 hover:text-white"
                  }`}
              >
                Dashboard
              </Link>
              {roleLoading&&<span aria-label="Loading account navigation" className="block h-8 w-40 animate-pulse rounded bg-white/10"/>}
              {!roleLoading&&restrictedLinks.map(link=><Link key={link.to} to={link.to} onClick={onClose} className={`block py-3 text-sm font-black uppercase tracking-[0.2em] transition-colors ${isActive(link.to)?"text-primary-400":"text-surface-400 hover:text-white"}`}>{link.label}</Link>)}
              <Link
                to="/resume-analyzer"
                onClick={onClose}
                className={`block py-3 text-sm font-black uppercase tracking-[0.2em] transition-colors ${isActive("/resume-analyzer")
                  ? "text-primary-400"
                  : "text-surface-400 hover:text-white"
                  }`}
              >
                Resume Analyzer
              </Link>
              <Link
                to="/analytics"
                onClick={onClose}
                className={`block py-3 text-sm font-black uppercase tracking-[0.2em] transition-colors ${isActive("/analytics")
                  ? "text-primary-400"
                  : "text-surface-400 hover:text-white"
                  }`}
              >
                Analytics
              </Link>
              <button
                onClick={handleLogout}
                className="block w-full text-left py-3 text-sm font-black uppercase tracking-[0.2em] text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                onClick={onClose}
                className={`block py-3 text-sm font-black uppercase tracking-[0.2em] transition-colors ${isActive("/login") ? "text-primary-400" : "text-surface-400 hover:text-white"
                  }`}
              >
                Login
              </Link>
              <Link
                to="/register"
                onClick={onClose}
                className={`block py-3 text-sm font-black uppercase tracking-[0.2em] transition-colors ${isActive("/register") ? "text-primary-400" : "text-surface-400 hover:text-white"
                  }`}
              >
                Register
              </Link>
            </>
          )}
        </div>
      </div>
    </>
  );
};
