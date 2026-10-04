import { Link } from "react-router-dom";
import { UserProfileMenu } from "./UserProfileMenu";

interface DesktopNavProps {
  user: { name: string } | null;
  isActive: (path: string) => boolean;
  onOpenModal: () => void;
}

const NAV_LINKS = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/resume-analyzer", label: "Resume Analyzer" },
  { to: "/analytics", label: "Analytics" },
];

export const DesktopNav = ({ user, isActive, onOpenModal }: DesktopNavProps) => {
  return (
    <nav className="hidden md:flex items-center gap-4">
      {user ? (
        <>
          {/* Floating pill nav — active page gets the solid white pill */}
          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1.5 backdrop-blur-xl shadow-[0_4px_24px_rgba(0,0,0,0.4)]">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.18em] transition-all duration-300 whitespace-nowrap ${
                  isActive(link.to)
                    ? "bg-white text-black shadow-[0_2px_12px_rgba(255,255,255,0.15)]"
                    : "text-surface-400 hover:text-white hover:bg-white/5"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <UserProfileMenu user={user} onOpenModal={onOpenModal} />
        </>
      ) : (
        <div className="flex items-center gap-2">
          <Link
            to="/login"
            className={`px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.18em] transition-all duration-300 ${
              isActive("/login")
                ? "text-white bg-white/10"
                : "text-surface-400 hover:text-white hover:bg-white/5"
            }`}
          >
            Login
          </Link>
          <Link
            to="/register"
            className="px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.18em] bg-white text-black hover:bg-zinc-200 transition-all duration-300 shadow-[0_2px_12px_rgba(255,255,255,0.15)]"
          >
            Register
          </Link>
        </div>
      )}
    </nav>
  );
};
