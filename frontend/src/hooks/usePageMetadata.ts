import { useEffect } from "react";
import { BRAND } from "../constants/brand";
import { publicSiteURL } from "../constants/seo";

const pageTitles: Record<string, string> = {
  login: "Sign in", register: "Create account", "forgot-password": "Reset password",
  "reset-password": "Reset password", dashboard: "Dashboard", plans: "Interview plan",
  interview: "Interview", review: "Interview feedback", analytics: "Analytics",
  "resume-analyzer": "Resume analysis",
};

export function usePageMetadata(pathname: string) {
  useEffect(() => {
    const landing = pathname === '/';
    document.title = landing ? `${BRAND.name} | ${BRAND.tagline}` :
      `${pageTitles[pathname.split('/')[1]] || 'Page'} | ${BRAND.name}`;
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement('meta');
      robots.name = 'robots';
      document.head.append(robots);
    }
    robots.content = landing ? 'index,follow' : 'noindex,nofollow';
    // The public home is the only canonical page; never expose private session URLs.
    const site = publicSiteURL(import.meta.env.VITE_PUBLIC_URL);
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (landing && site) {
      if (!canonical) {
        canonical = document.createElement('link');
        canonical.rel = 'canonical';
        document.head.append(canonical);
      }
      canonical.href = site;
    } else canonical?.remove();
  }, [pathname]);
}
