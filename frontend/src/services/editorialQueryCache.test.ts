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
 resolveOld(["old draft"]);await expect(old).rejects.toThrow("Query superseded");
 expect(editorialQueryCache.get<string[]>(key).data).toEqual(["new saved revision"]);
});

it('refetches invalidated summaries immediately and isolates account switches',async()=>{
 await editorialQueryCache.load('http:/analytics',async()=>['first account']);
 editorialQueryCache.invalidatePrefix('http:');
 expect(await editorialQueryCache.load('http:/analytics',async()=>['after completion'])).toEqual(['after completion']);
 let release!:(value:string[])=>void;
 const old=editorialQueryCache.load('http:/sessions',()=>new Promise<string[]>(resolve=>{release=resolve;}));
 editorialQueryCache.setIdentity('second-account');
 release(['private old result']);await expect(old).rejects.toThrow('Query superseded');
 expect(editorialQueryCache.get('http:/sessions').data).toBeUndefined();
 expect(editorialQueryCache.get('http:/analytics').data).toBeUndefined();
 expect(await editorialQueryCache.load('http:/analytics',async()=>['second account'])).toEqual(['second account']);
 editorialQueryCache.setIdentity(null);
 expect(editorialQueryCache.get('http:/analytics').data).toBeUndefined();
});

it('does not disguise HTTP authentication failures as cached success',async()=>{
 await editorialQueryCache.load('http:/analytics',async()=>['private']);
 editorialQueryCache.invalidatePrefix('http:');
 await expect(editorialQueryCache.load('http:/analytics',async()=>{throw new Error('401');},{allowStaleOnError:false})).rejects.toThrow('401');
});
