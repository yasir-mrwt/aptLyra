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

it("ignores reads started before a successful mutation instead of restoring stale cards",async()=>{
 let resolveOld!:(value:string[])=>void;
 const old=editorialQueryCache.load(key,()=>new Promise<string[]>(resolve=>{resolveOld=resolve;}));
 editorialQueryCache.invalidate([key]);
 await editorialQueryCache.load(key,async()=>["new saved revision"],{force:true});
 resolveOld(["old draft"]);await old;
 expect(editorialQueryCache.get<string[]>(key).data).toEqual(["new saved revision"]);
});
