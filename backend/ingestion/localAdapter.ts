import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { extname, basename, isAbsolute } from "node:path";
import type { Difficulty, QuestionCategory } from "../types/knowledge.js";

export class IngestionError extends Error {
  constructor(public readonly code: string) { super(code); }
}
export const fail = (code: string): never => { throw new IngestionError(code); };
export const sha256 = (text: string | Buffer): string => createHash("sha256").update(text).digest("hex");
export const roles = ["Software Engineer", "Backend Developer", "Full Stack Developer"] as const;
export const categories = ["conceptual-oral", "scenario", "coding", "debugging", "sql", "system-design-lite"] as const;
export const difficulties = ["easy", "standard", "stretch"] as const;
export interface QuestionSpec {
  text: string; category: QuestionCategory; difficulty: Difficulty; primary: string;
  secondary: string[]; roles: string[];
}
export interface Experience {
  company: string; role: string; occurredOn: string | null; track: string | null;
  submitterType: "self-report" | "permission-approved-report" | "fixture";
  consentEvidence: string; permissionRevision: string;
}
export interface DocumentEnvelope {
  key: string; title: string; text: string; questions: unknown[]; experience: Experience | null;
}
export interface AdapterContract {
  adapterId: "local-file"; version: "1";
  sourceType: "authored" | "licensed-reference" | "voluntary-experience";
  allowedInputs: string[]; approvedInputHashes: string[]; permissionEvidence: string; licenseId: string;
  termsRevision: string; attribution: string; authentication: "operator-filesystem";
  refresh: "manual"; maxBytes: number; timeoutMs: number; maxDocuments: number;
  minIntervalMs: number; timestampSemantics: "occurrence-explicit-fetch-observed";
  withdrawal: "retire-and-redact"; retainRaw: false; fixture: boolean;
}
export function object(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("invalid-object");
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some(k => !allowed.includes(k))) return fail("unknown-field");
  return result;
}
export function textField(value: unknown, max: number): string {
  if (typeof value !== "string" || !value.trim() || Buffer.byteLength(value) > max) return fail("invalid-text");
  return value.normalize("NFKC").trim();
}
function list(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) return fail("invalid-list");
  return value;
}
export function validateContract(value: unknown): AdapterContract {
  const v = object(value,["adapterId","version","sourceType","allowedInputs","approvedInputHashes","permissionEvidence","licenseId","termsRevision",
    "attribution","authentication","refresh","maxBytes","timeoutMs","maxDocuments","minIntervalMs","timestampSemantics","withdrawal","retainRaw","fixture"]);
  if (v.adapterId !== "local-file" || v.version !== "1" || !["authored","licensed-reference","voluntary-experience"].includes(String(v.sourceType)) ||
    v.authentication !== "operator-filesystem" || v.refresh !== "manual" || v.timestampSemantics !== "occurrence-explicit-fetch-observed" ||
    v.withdrawal !== "retire-and-redact" || v.retainRaw !== false || typeof v.fixture !== "boolean") return fail("unsupported-adapter-contract");
  const inputs = list(v.allowedInputs,100).map(p => textField(p,2000));
  const hashes = list(v.approvedInputHashes,100).map(p=>textField(p,64));
  if (hashes.some(h=>!/^[a-f0-9]{64}$/.test(h))) return fail("invalid-permission-hash");
  if (!inputs.length || inputs.some(p => !isAbsolute(p) || ![".md",".json"].includes(extname(p).toLowerCase()))) return fail("invalid-input-allowlist");
  for (const [key, min, max] of [["maxBytes",1,262144],["timeoutMs",1,5000],["maxDocuments",1,80],["minIntervalMs",0,3600000]] as const) {
    if (!Number.isInteger(v[key]) || Number(v[key]) < min || Number(v[key]) > max) return fail("invalid-limit");
  }
  for (const key of ["permissionEvidence","licenseId","termsRevision","attribution"]) textField(v[key],2000);
  return {...v, allowedInputs: inputs, approvedInputHashes: hashes} as unknown as AdapterContract;
}
/** Bounded regular-file read, exact canonical path allowlist, no URL or symlink input.
 * A trusted operator controls the allowlisted directory; never grant its write
 * access to untrusted users. File reads cannot be cancelled by a model. */
export async function readLocalFile(path: string, contract: AdapterContract): Promise<Buffer> {
  const started = performance.now();
  if (!contract.allowedInputs.includes(path)) return fail("input-not-allowed");
  if (await realpath(path) !== path) return fail("noncanonical-input");
  const file = await open(path,constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > contract.maxBytes) return fail("file-limit");
    const buffer = Buffer.alloc(contract.maxBytes+1);
    const { bytesRead } = await file.read(buffer,0,buffer.length,0);
    if (bytesRead > contract.maxBytes) return fail("file-limit");
    if (performance.now()-started > contract.timeoutMs) return fail("read-timeout");
    return buffer.subarray(0,bytesRead);
  } finally { await file.close(); }
}
export function decode(buffer: Buffer): string {
  let result: string;
  try { result = new TextDecoder("utf-8",{fatal:true}).decode(buffer); } catch { return fail("invalid-utf8"); }
  if ([...result].some(c=>{const n=c.charCodeAt(0); return (n<32 && ![9,10,13].includes(n)) || n===127;})) return fail("binary-input");
  return result;
}
export function normalize(raw: string): string {
  // Screening runs BEFORE stripping: hidden scripts/instructions cannot disappear.
  const text = raw.normalize("NFKC").replace(/\r\n?/g,"\n")
    .replace(/<!--[\s\S]*?-->/g," ").replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi," ")
    .replace(/<[^>]{1,1000}>/g," ").replace(/&(?:nbsp|amp|lt|gt|quot);/g,m=>({"&nbsp;":" ","&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"'}[m]!))
    .replace(/^\s{0,3}#{1,6}\s+/gm,"").replace(/\[([^\]\n]+)\]\([^)\n]+\)/g,"$1")
    .replace(/^[ \t]*(?:subscribe to our newsletter|cookie preferences|all rights reserved)[^\n]*$/gim,"")
    .replace(/[ \t]+/g," ").replace(/ *\n */g,"\n").replace(/\n{3,}/g,"\n\n").trim();
  if (!text || Buffer.byteLength(text)>12000) return fail("normalized-text-limit");
  return text;
}
/** Signals only, no matching snippets returned. Conservative and intentionally incomplete. */
export function screen(raw: string): string[] {
  const value = raw.normalize("NFKC");
  const patterns: [string,RegExp][] = [
    ["email",/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
    ["phone",/(?<!\w)(?:\+\d{1,3}[ .-]?)?(?:\(\d{3}\)|\d{3})[ .-]\d{3}[ .-]\d{4}(?!\w)/],
    ["identifier",/\b(?:ssn|passport|national.?id|account.?number|user.?id)\s*[:=]\s*\S+/i],
    ["address",/\b\d{1,5}\s+(?:[A-Z][a-z]+\s+){1,4}(?:Street|Road|Avenue|Lane|Drive)\b/],
    ["credential",/(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:api[_ -]?key|password|secret|access[_ -]?token)\s*[:=]\s*["']?\S{6,}|\b(?:sk-|ghp_|AKIA)[A-Za-z0-9_-]{12,})/i],
    ["confidential",/\b(?:confidential|under NDA|do not share|leaked interview|proprietary take.home|internal.only)\b/i],
    ["third-party",/\b(?:interviewer|candidate|employee)\s+(?:name\s*[:=]|[A-Z][a-z]+\s+[A-Z][a-z]+)/],
    ["injection",/(?:ignore (?:all |the )?(?:previous|prior|system) instructions|(?:fetch|visit|open)\s+https?:|system\s*prompt|(?:reviewer|license|source.?id)\s*[:=]|approve (?:this|my) (?:source|document)|<script\b|javascript:|display\s*:\s*none|<!--)/i],
  ];
  return patterns.filter(([,pattern])=>pattern.test(value)).map(([code])=>code);
}
export function validateQuestion(value: unknown, children: Set<string>, sourceText: string): QuestionSpec {
  const v = object(value,["text","category","difficulty","primary","secondary","roles"]);
  const text = normalize(textField(v.text,12000));
  const primary = textField(v.primary,100);
  const secondary = list(v.secondary,8).map(x=>textField(x,100));
  const selectedRoles = list(v.roles,3).map(x=>textField(x,100));
  if (!children.has(primary) || secondary.some(x=>!children.has(x)) || new Set(secondary).size!==secondary.length || secondary.includes(primary)) return fail("invalid-competency");
  if (!categories.includes(v.category as QuestionCategory) || !difficulties.includes(v.difficulty as Difficulty)) return fail("invalid-classification");
  if (!selectedRoles.length || selectedRoles.some(x=>!roles.includes(x as typeof roles[number])) || new Set(selectedRoles).size!==selectedRoles.length) return fail("invalid-role");
  if (screen(text).length) return fail("unsafe-question");
  if (!sourceText.includes(text)) return fail("unsupported-evidence-span");
  return {text,primary,secondary,roles:selectedRoles,category:v.category as QuestionCategory,difficulty:v.difficulty as Difficulty};
}
export function validOccurrence(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fail("invalid-occurrence");
  const date = new Date(value+"T00:00:00Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10)!==value || value<"1970-01-01") return fail("invalid-occurrence");
  return value;
}
export function isRecentExperience(occurredOn: string | null, planningAt: Date): boolean {
  if (!Number.isFinite(planningAt.getTime())) return false;
  const value = validOccurrence(occurredOn);
  if (!value) return false;
  const delta = planningAt.getTime()-new Date(value+"T00:00:00Z").getTime();
  return delta>=0 && delta<=180*86400000;
}
export function parseEnvelope(buffer: Buffer, path: string, contract: AdapterContract): DocumentEnvelope[] {
  const raw = decode(buffer);
  if (extname(path).toLowerCase()===".md") {
    if (contract.sourceType==="voluntary-experience") return fail("experience-metadata-required");
    return [{key:basename(path),title:basename(path),text:raw,questions:[],experience:null}];
  }
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return fail("invalid-json"); }
  const root = object(value,["schemaVersion","documents"]);
  if (root.schemaVersion!=="local-v1") return fail("invalid-envelope-version");
  const docs = list(root.documents,contract.maxDocuments);
  if (!docs.length) return fail("empty-envelope");
  const result = docs.map(item=>{
    const v=object(item,["key","title","text","questions","experience"]);
    const key=textField(v.key,200), title=textField(v.title,300), text=textField(v.text,16000);
    const questions=list(v.questions,20);
    let experience: Experience | null = null;
    if (v.experience!==undefined && v.experience!==null) {
      const e=object(v.experience,["company","role","occurredOn","track","submitterType","consentEvidence","permissionRevision"]);
      if (contract.sourceType!=="voluntary-experience" || !roles.includes(e.role as typeof roles[number]) ||
        !["self-report","permission-approved-report","fixture"].includes(String(e.submitterType)) ||
        (e.submitterType==="fixture" && !contract.fixture)) return fail("invalid-experience");
      experience={company:textField(e.company,200),role:String(e.role),occurredOn:validOccurrence(e.occurredOn),
        track:e.track===null ? null : textField(e.track,200),submitterType:e.submitterType as Experience["submitterType"],
        consentEvidence:textField(e.consentEvidence,2000),permissionRevision:textField(e.permissionRevision,100)};
    }
    if (contract.sourceType==="voluntary-experience" && !experience) return fail("experience-metadata-required");
    return {key,title,text,questions,experience};
  });
  if (new Set(result.map(d=>d.key)).size!==result.length) return fail("duplicate-document-key");
  return result;
}
export function jaccard(left: string, right: string): number {
  const shingles = (value: string): Set<string> => {
    const words = value.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
    const n = Math.min(3,words.length);
    return new Set(words.slice(0,words.length-n+1).map((_,i)=>words.slice(i,i+n).join(" ")));
  };
  const a=shingles(left), b=shingles(right);
  if (!a.size || !b.size) return 0;
  let common=0;
  for (const s of a) if (b.has(s)) common++;
  return common/(a.size+b.size-common);
}
