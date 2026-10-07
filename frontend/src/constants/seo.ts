import { BRAND } from "./brand";

/** Set only after the operator selects a public origin; no presumed domain. */
export function publicSiteURL(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  const url = new URL(value.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.search || url.hash || url.pathname !== '/') {
    throw new Error('VITE_PUBLIC_URL must be an HTTP(S) origin without credentials, path, query or fragment');
  }
  return url.href;
}

export function publicMetadata(value: string | undefined) {
  const site = publicSiteURL(value);
  return [
    { tag: 'title', children: `${BRAND.name} | ${BRAND.tagline}` },
    { tag: 'meta', attrs: { name: 'description', content: BRAND.description } },
    { tag: 'meta', attrs: { property: 'og:type', content: 'website' } },
    { tag: 'meta', attrs: { property: 'og:site_name', content: BRAND.name } },
    { tag: 'meta', attrs: { property: 'og:title', content: BRAND.name } },
    { tag: 'meta', attrs: { property: 'og:description', content: BRAND.description } },
    { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary' } },
    { tag: 'meta', attrs: { name: 'twitter:title', content: BRAND.name } },
    { tag: 'meta', attrs: { name: 'twitter:description', content: BRAND.description } },
    ...(site ? [
      { tag: 'link', attrs: { rel: 'canonical', href: site } },
      { tag: 'meta', attrs: { property: 'og:url', content: site } },
    ] : []),
  ];
}
