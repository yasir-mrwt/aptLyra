import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import type { RootState } from "../app/store";
import { AnimatePresence } from "framer-motion";

import AccountModal from "./AccountModal";
import { Logo } from "./header/Logo";
import { DesktopNav } from "./header/DesktopNav";
import { MobileNav } from "./header/MobileNav";
import type { AppRole } from "../features/auth/roleSlice";

const Header = () => {
  const { user } = useSelector((state: RootState) => state.auth);
  const roleState=useSelector((state:RootState)=>state.role);
  const currentUserId=user?.id||user?._id;
  const roleLoading=Boolean(user&&(!currentUserId||roleState.userId!==currentUserId||roleState.status==="idle"||roleState.status==="loading"));
  const role=roleState.status==="ready"&&roleState.userId===currentUserId?roleState.role as AppRole|null:null;
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const location = useLocation();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const isActive = (path: string) => location.pathname === path;

  return (
    <>
      <header
        className={`sticky top-0 z-50 transition-all duration-500 ${
          scrolled
            ? "bg-surface-950/70 backdrop-blur-2xl border-b border-white/[0.06] py-2 shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
            : "bg-transparent py-4 border-b border-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-full">
            {/* Logo Section */}
            <Logo />

            {/* Desktop Navigation */}
            <DesktopNav
              user={user}
              isActive={isActive}
              onOpenModal={() => setIsAccountModalOpen(true)}
              role={role}
              roleLoading={roleLoading}
            />

            {/* Mobile Menu Button + Navigation Dropdown */}
            <MobileNav
              user={user}
              isOpen={isMenuOpen}
              onToggle={() => setIsMenuOpen(!isMenuOpen)}
              onClose={() => setIsMenuOpen(false)}
              isActive={isActive}
              onOpenModal={() => setIsAccountModalOpen(true)}
              role={role}
              roleLoading={roleLoading}
            />
          </div>
        </div>
      </header>

      {/* User Settings Modal */}
      <AnimatePresence>
        {isAccountModalOpen && (
          <AccountModal onClose={() => setIsAccountModalOpen(false)} />
        )}
      </AnimatePresence>
    </>
  );
};

export default Header;
