/**
 * Vitest global setup.
 * jsdom lacks IntersectionObserver, which framer-motion's `whileInView`
 * animations (landing page) rely on — stub it with a no-op implementation.
 */

class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin: string = "";
  readonly thresholds: ReadonlyArray<number> = [];

  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

globalThis.IntersectionObserver =
  globalThis.IntersectionObserver ?? MockIntersectionObserver;

// Some Node/Vitest combinations expose an unavailable Node localStorage
// global ahead of jsdom's Storage implementation. Keep auth tests isolated
// with a deterministic in-memory implementation instead of changing product
// storage behavior.
if (!globalThis.localStorage) {
  class MemoryStorage implements Storage {
    private values = new Map<string, string>();

    get length(): number {
      return this.values.size;
    }

    clear(): void {
      this.values.clear();
    }

    getItem(key: string): string | null {
      return this.values.get(String(key)) ?? null;
    }

    key(index: number): string | null {
      return [...this.values.keys()][index] ?? null;
    }

    removeItem(key: string): void {
      this.values.delete(String(key));
    }

    setItem(key: string, value: string): void {
      this.values.set(String(key), String(value));
    }
  }

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: new MemoryStorage(),
  });
}

// jsdom also lacks scrollTo / matchMedia in some versions — guard both.
if (!globalThis.matchMedia) {
  globalThis.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}
