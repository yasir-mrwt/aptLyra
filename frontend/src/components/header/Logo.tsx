import { BRAND } from "../../constants/brand";
import AptlyraMark from "../AptlyraMark";
import { Link } from "react-router-dom";

export const Logo = () => {
  return (
    <Link to="/" className="flex items-center space-x-3 group transition-all duration-300">
      <AptlyraMark className="h-9 w-9 group-hover:rotate-6 group-hover:scale-105 transition-all duration-500 drop-shadow-[0_0_16px_rgba(255,255,255,0.2)]" />
      <span className="text-2xl font-black tracking-tighter uppercase font-display text-white group-hover:text-surface-300 transition-colors">
        {BRAND.name}
      </span>
    </Link>
  );
};
