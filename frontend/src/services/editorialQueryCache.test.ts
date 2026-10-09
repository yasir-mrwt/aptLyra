import { beforeEach, describe, expect, it, vi } from "vitest";
import { editorialQueryCache } from "./editorialQueryCache";

const key = "/content-intelligence/review/candidates";

beforeEach(() => editorialQueryCache.setIdentity(`test-${Math.random()}`));

describe("editorial section cache", () => {
  it("deduplicates in-flight requests and serves fresh data on tab return", async () => {
    let resolve!: (data: string[]) => void;
    const request = vi.fn(() => new Promise<string[]>(done => { resolve = done; }));
    const first = editorialQueryCache.load(key, request);
    const second = editorialQueryCache.load(key, request);
    expect(request).toHaveBeenCalledTimes(1);
    resolve(["question"]);
    await expect(first).resolves.toEqual(["question"]);
    await expect(second).resolves.toEqual(["question"]);
    const returned = await editorialQueryCache.load(key, vi.fn(async () => ["new"]));
    expect(returned).toEqual(["question"]);
  });

  it("keeps cached data visible and marks it stale if revalidation fails", async () => {
    await editorialQueryCache.load(key, async () => ["last successful result"]);
    editorialQueryCache.invalidate([key]);
    await editorialQueryCache.load(key, async () => { throw new Error("temporary outage"); });
    await Promise.resolve();
    await Promise.resolve();
    const state = editorialQueryCache.get<string[]>(key);
    expect(state.data).toEqual(["last successful result"]);
    expect(state.error).toBe("This section could not be loaded.");
    expect(state.stale).toBe(true);
  });
});
