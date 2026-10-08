import { roles, screen, normalize, sha256, textField, validOccurrence, fail } from "../ingestion/localAdapter.js";

const roleSet = new Set<string>(roles);

export function validateSubmission(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("invalid-submission");
  const v = value as Record<string, unknown>;
  const allowed = ["company", "role", "occurredOn", "roundType", "topics", "questions", "notes", "practiceConsent", "rightToShare", "anonymizedResearchConsent", "aiProcessingConsent"];
  if (Object.keys(v).some(key => !allowed.includes(key)) || !roleSet.has(String(v.role))) fail("invalid-submission");
  if (v.practiceConsent !== true || v.rightToShare !== true) fail("consent-required");
  const topics = Array.isArray(v.topics) ? v.topics.map(x => textField(x, 120)) : fail("invalid-topics");
  const questions = Array.isArray(v.questions) ? v.questions.map(x => textField(x, 1000)) : fail("invalid-questions");
  if (topics.length > 12) fail("invalid-topics");
  if (questions.length > 20) fail("invalid-questions");
  if (!topics.length && !questions.length) fail("invalid-submission");
  const occurredOn = validOccurrence(v.occurredOn ?? null);
  const company = v.company == null || v.company === "" ? null : textField(v.company, 200);
  const roundType = v.roundType == null || v.roundType === "" ? null : textField(v.roundType, 100);
  const notes = v.notes == null || v.notes === "" ? null : textField(v.notes, 4000);
  const body = { company, role: v.role, occurredOn, roundType, topics, questions, notes };
  const raw = JSON.stringify(body);
  const signals = screen(raw);
  if (signals.length) fail(`unsafe-submission:${signals.join(",")}`);
  const cleaned = normalize(raw);
  return { ...body, cleaned, hash: sha256(cleaned), anonymized: v.anonymizedResearchConsent === true, aiProcessingConsent: v.aiProcessingConsent === true };
}
