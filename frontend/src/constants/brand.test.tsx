import { cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { Logo } from '../components/header/Logo';
import { BRAND } from './brand';
import { INTERVIEWER_PROFILE } from './interviewer';
import { publicMetadata, publicSiteURL } from './seo';
import { usePageMetadata } from '../hooks/usePageMetadata';

afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

describe('current product identity', () => {
  it('renders the current header identity and accessible logo', () => {
    render(<MemoryRouter><Logo /></MemoryRouter>);
    expect(screen.getByText('Aptlyra')).toBeTruthy();
    expect(screen.getByAltText('Aptlyra')).toBeTruthy();
    expect(INTERVIEWER_PROFILE.displayName).toBe('Lyra');
    expect(BRAND.initial).toBe('A');
  });
  it('emits truthful social metadata without assuming an owned domain', () => {
    const metadata = publicMetadata(undefined);
    expect(JSON.stringify(metadata)).toContain(BRAND.description);
    expect(metadata.some(tag => tag.tag === 'link')).toBe(false);
    expect(JSON.stringify(metadata)).not.toMatch(/TechVera|PrepTalk|\bAva\b/i);
    expect(publicMetadata('https://example.test').find(tag => tag.tag === 'link')?.attrs?.href)
      .toBe('https://example.test/');
    for (const value of ['javascript:alert(1)', 'https://user:password@example.test', 'https://example.test/private?id=1']) {
      expect(() => publicSiteURL(value)).toThrow();
    }
  });
  it('removes private canonicals and restores the landing canonical on navigation', () => {
    vi.stubEnv('VITE_PUBLIC_URL', 'https://example.test');
    const { rerender } = renderHook(({ path }) => usePageMetadata(path), { initialProps: { path: '/' } });
    expect(document.title).toContain(BRAND.tagline);
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://example.test/');
    rerender({ path: '/interview/private-session-id' });
    expect(document.title).toBe('Interview | Aptlyra');
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex,nofollow');
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
    rerender({ path: '/' });
    expect(document.querySelector('link[rel="canonical"]')).not.toBeNull();
  });
});
