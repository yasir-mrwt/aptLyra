export type EditorialQueryState<T = unknown> = {
  data: T | undefined;
  loadedAt: number;
  loading: boolean;
  error: string | null;
  stale: boolean;
};

const TTL_MS = 45_000;
const entries = new Map<string, EditorialQueryState>();
const pending = new Map<string, Promise<unknown>>();
const listeners = new Set<() => void>();
let snapshotVersion = 0;
let identity: string | null = null;
let generation = 0;
const empty = (): EditorialQueryState => ({ data: undefined, loadedAt: 0, loading: false, error: null, stale: false });
const emit = () => { snapshotVersion += 1; listeners.forEach(listener => listener()); };

export const editorialQueryCache = {
  subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); },
  getVersion() { return snapshotVersion; },
  get<T>(key: string): EditorialQueryState<T> { return (entries.get(key) || empty()) as EditorialQueryState<T>; },
  setIdentity(next: string | null) {
    if (identity === next) return;
    identity = next;
    generation += 1;
    entries.clear();
    pending.clear();
    emit();
  },
  async load<T>(key: string, fetcher: () => Promise<T>, options: { force?: boolean } = {}): Promise<T | undefined> {
    const current = this.get<T>(key);
    const fresh = current.data !== undefined && Date.now() - current.loadedAt < TTL_MS;
    if (!options.force && fresh) return current.data;
    if (current.data !== undefined && !options.force) {
      if (!pending.has(key)) void this.fetch(key, fetcher);
      return current.data;
    }
    const active = pending.get(key);
    if (active) return active as Promise<T>;
    return this.fetch(key, fetcher) as Promise<T>;
  },
  async fetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const startedGeneration = generation;
    const previous = this.get<T>(key);
    entries.set(key, { ...previous, loading: true, error: null, stale: previous.data !== undefined });
    emit();
    const request = fetcher().then(data => {
      if (generation === startedGeneration) { entries.set(key, { data, loadedAt: Date.now(), loading: false, error: null, stale: false }); emit(); }
      return data;
    }).catch(error => {
      const current = this.get<T>(key);
      if (generation === startedGeneration) { entries.set(key, { ...current, loading: false, error: "This section could not be loaded.", stale: current.data !== undefined }); emit(); }
      if (current.data !== undefined) return current.data;
      throw error;
    }).finally(() => { if (pending.get(key) === request) pending.delete(key); });
    pending.set(key, request);
    return request;
  },
  invalidate(keys: string[]) {
    for (const key of keys) {
      const current = entries.get(key);
      if (current) entries.set(key, { ...current, loadedAt: 0, stale: current.data !== undefined });
    }
    emit();
  },
  clear() { generation += 1; entries.clear(); pending.clear(); emit(); },
};
