export class QuerySupersededError extends Error { constructor(){super("Query superseded");this.name="QuerySupersededError";} }
export type EditorialQueryState<T = unknown> = {
  data: T | undefined;
  loadedAt: number;
  loading: boolean;
  error: string | null;
  stale: boolean;
};

const TTL_MS = 45_000;
const entries = new Map<string, EditorialQueryState>();
const revisions = new Map<string, number>();
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
  async load<T>(key: string, fetcher: () => Promise<T>, options: { force?: boolean; allowStaleOnError?: boolean } = {}): Promise<T | undefined> {
    const current = this.get<T>(key);
    const fresh = !current.stale && current.data !== undefined && Date.now() - current.loadedAt < TTL_MS;
    if (!options.force && fresh) return current.data;
    if (current.data !== undefined && current.loadedAt > 0 && !options.force && options.allowStaleOnError !== false) {
      if (!pending.has(key)) void this.fetch(key, fetcher).catch(()=>{});
      return current.data;
    }
    const active = pending.get(key);
    if (active) return active as Promise<T>;
    return this.fetch(key, fetcher, options.allowStaleOnError !== false) as Promise<T>;
  },
  async fetch<T>(key: string, fetcher: () => Promise<T>, allowStaleOnError = true): Promise<T> {
    const startedGeneration = generation;
    const startedRevision = revisions.get(key) || 0;
    const previous = this.get<T>(key);
    entries.set(key, { ...previous, loading: true, error: null, stale: previous.data !== undefined });
    emit();
    const request = fetcher().then(data => {
      if (generation !== startedGeneration || (revisions.get(key)||0) !== startedRevision) throw new QuerySupersededError();
      if (generation === startedGeneration && (revisions.get(key)||0) === startedRevision) { entries.set(key, { data, loadedAt: Date.now(), loading: false, error: null, stale: false }); emit(); }
      return data;
    }).catch(error => {
      if (generation !== startedGeneration || (revisions.get(key)||0) !== startedRevision) throw error;
      const current = this.get<T>(key);
      if (generation === startedGeneration && (revisions.get(key)||0) === startedRevision) { entries.set(key, { ...current, loading: false, error: "This section could not be loaded.", stale: current.data !== undefined }); emit(); }
      if (allowStaleOnError && current.data !== undefined) return current.data;
      throw error;
    }).finally(() => { if (pending.get(key) === request) pending.delete(key); });
    pending.set(key, request);
    return request;
  },
  invalidatePrefix(prefix: string, exclude: string[] = []) { this.invalidate([...entries.keys()].filter(key => key.startsWith(prefix) && !exclude.some(value=>key.startsWith(value)))); window.dispatchEvent(new CustomEvent("aptlyra-data-invalidated",{detail:{prefix}})); },
  invalidate(keys: string[]) {
    for (const key of keys) {
      revisions.set(key,(revisions.get(key)||0)+1);
      pending.delete(key);
      const current = entries.get(key);
      if (current) entries.set(key, { ...current, loadedAt: 0, stale: current.data !== undefined });
    }
    emit();
  },
  clear() { generation += 1; entries.clear(); pending.clear(); revisions.clear(); emit(); },
};
