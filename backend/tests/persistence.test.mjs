/** Real SQL/Redis, deterministic AI fixtures. Refuses all external datastore configuration. */
import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
for (const key of ['DATABASE_URL', 'NEON_DATABASE_URL', 'REDIS_URL', 'UPSTASH_REDIS_URL']) {
  if (process.env[key]) throw new Error(`Unset ${key}: persistence tests select only disposable localhost fixtures`);
}
process.env.DATABASE_URL = 'postgresql://techvera_test:techvera_local_fixture@127.0.0.1:15432/techvera_test';
process.env.DATABASE_SSL = 'false';
process.env.REDIS_URL = 'redis://127.0.0.1:16379/15';
process.env.NODE_ENV = 'test';
const { query, pool, bootstrapSchema, withDatabaseLock } = await import('../dist/config/db.js');
const { sessionRepository: repo, withSessionLock } = await import('../dist/models/Session.js');
const { sessionService: service } = await import('../dist/services/sessionService.js');
const { aiService: ai } = await import('../dist/services/aiService.js');
const { gamificationService: game } = await import('../dist/services/gamificationService.js');
const { default: redis } = await import('../dist/config/redisConfig.js');
redis.options.maxRetriesPerRequest = 1;
redis.options.retryStrategy = times => times < 3 ? 50 : null;
const { XP_REWARDS } = await import('../dist/config/achievements.js');
const owner = randomUUID(), other = randomUUID();
const events = [];
const io = { to: () => ({ emit: (_event, data) => events.push(data) }) };
const result = { technical_score: 85, confidence_score: 75, ai_feedback: 'Fixture feedback', ideal_answer: 'Fixture answer' };
let evaluated = 0;
ai.evaluateAnswer = async () => { evaluated++; return result; };
ai.generateFollowUp = async () => ({ question: 'Probe', ideal_answer: 'Answer', question_type: 'oral' });
async function active(count = 1) {
  const s = await repo.create({ user: owner, role: 'Backend', level: 'Junior', interviewType: 'coding-mix' });
  s.questions = Array.from({ length: count }, () => ({ questionText: 'Explain loops', idealAnswer: 'Iteration', questionType: 'coding', isSubmitted: false, isEvaluated: false }));
  s.status = 'in-progress';
  return withSessionLock(s._id, () => repo.save(s));
}
async function until(fn) {
  for (let n = 0; n < 200; n++) { if (await fn()) return; await new Promise(resolve => setTimeout(resolve, 20)); }
  throw new Error('Background fixture did not finish');
}
before(async () => {
  await bootstrapSchema(); await bootstrapSchema();
  for (const id of [owner, other]) await query('INSERT INTO users(id,name,email) VALUES($1,$2,$3)', [id, 'Fixture', `${id}@example.invalid`]);
  assert.equal(await redis.ping(), 'PONG');
});
after(async () => {
  try {
    await redis.del(`user:${owner}:xp_buffer`);
    await query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[owner, other]]);
  } finally { redis.disconnect(); await pool.end(); }
});
test('schema bootstrap, company transport, JSONB roundtrip and ownership', async () => {
  let received;
  ai.generateQuestions = async params => { received = params; return { questions: [{ question: 'Q', ideal_answer: 'A', question_type: 'oral' }] }; };
  const s = await service.createInterviewSession(owner, 'Backend', 'Junior', 'company-specific', 1, 'Acme', 'Platform', undefined, io);
  await until(async () => (await repo.findById(s._id)).status === 'in-progress');
  const saved = await repo.findByIdForUser(s._id, owner);
  assert.equal(saved.company, 'Acme'); assert.equal(saved.companyTrack, 'Platform');
  assert.equal(received.company, 'Acme'); assert.equal(received.companyTrack, 'Platform');
  assert.equal(saved.questions[0].questionText, 'Q');
  assert.equal(await repo.findByIdForUser(s._id, other), null);
  await assert.rejects(() => service.submitSessionAnswer(s._id, other, '0', 'code', 'js', null, null, io), /Session not found/);
});
test('database lock serializes independent clients and rolls back changes', async () => {
  const order = [];
  await Promise.all([1, 2, 3].map(n => withDatabaseLock('fixture-concurrency', async () => {
    order.push(`start${n}`); await new Promise(resolve => setTimeout(resolve, 20)); order.push(`end${n}`);
  })));
  for (let n = 0; n < 6; n += 2) assert.equal(order[n].slice(5), order[n + 1].slice(3));
  const s = await active();
  await assert.rejects(() => withSessionLock(s._id, async () => { s.status = 'completed'; await repo.save(s); throw new Error('Fixture rollback'); }));
  assert.equal((await repo.findById(s._id)).status, 'in-progress');
});
test('concurrent duplicate answers evaluate once and completion rewards persist once', async () => {
  const s = await active();
  const beforeXP = (await query('SELECT xp FROM users WHERE id=$1', [owner])).rows[0].xp;
  evaluated = 0;
  const submissions = await Promise.allSettled([1, 2, 3].map(() => service.submitSessionAnswer(s._id, owner, '0', 'code', 'js', null, null, io)));
  assert.equal(submissions.filter(x => x.status === 'fulfilled').length, 1);
  await until(async () => (await repo.findById(s._id)).status === 'completed');
  assert.equal(evaluated, 1);
  const xp = (await query('SELECT xp FROM users WHERE id=$1', [owner])).rows[0].xp;
  assert.ok(xp >= beforeXP + XP_REWARDS.COMPLETE_INTERVIEW + XP_REWARDS.PERFECT_QUESTION);
  const end = (await repo.findById(s._id)).endTime;
  await Promise.all([1, 2, 3].map(() => service.endInterviewSession(s._id, owner, io)));
  assert.equal((await query('SELECT xp FROM users WHERE id=$1', [owner])).rows[0].xp, xp);
  assert.equal((await repo.findById(s._id)).endTime, end);
  await assert.rejects(() => service.submitSessionAnswer(s._id, owner, '0', 'code', 'js', null, null, io), /not active/);
});
test('manual completion and completion XP are atomic on a reward failure', async () => {
  const s = await active();
  const reward = game.rewardCompletion;
  game.rewardCompletion = async () => { throw new Error('Fixture reward failure'); };
  await assert.rejects(() => service.endInterviewSession(s._id, owner, io), /reward failure/);
  assert.equal((await repo.findById(s._id)).status, 'in-progress');
  game.rewardCompletion = reward;
  await Promise.all([1, 2, 3].map(() => service.endInterviewSession(s._id, owner, io)));
  assert.equal((await repo.findById(s._id)).status, 'completed');
});
test('legal lifecycle states and strict index checks', async () => {
  const s = await active();
  await assert.rejects(() => service.submitSessionAnswer(s._id, owner, '0junk', 'code', 'js', null, null, io), /Invalid question index/);
  for (const status of ['pending', 'failed', 'cancelled']) {
    s.status = status; await withSessionLock(s._id, () => repo.save(s));
    await assert.rejects(() => service.submitSessionAnswer(s._id, owner, '0', 'code', 'js', null, null, io), /not active/);
    await assert.rejects(() => service.endInterviewSession(s._id, owner, io), /Only active/);
  }
});
test('STT failure permits retry, never grades and cleans audio', async () => {
  const s = await active(); s.questions[0].questionType = 'oral'; s.questions[0].isSubmitted = true;
  await withSessionLock(s._id, () => repo.save(s));
  const audio = join(tmpdir(), `${randomUUID()}.webm`); await writeFile(audio, 'fixture audio');
  ai.analyzeSpeech = async () => { throw new Error('Fixture STT failure'); };
  evaluated = 0;
  await service.evaluateAnswerAsync(io, owner, s._id, 0, null, null, audio, null);
  const q = (await repo.findById(s._id)).questions[0];
  assert.equal(evaluated, 0); assert.equal(q.isEvaluated, false); assert.equal(q.isSubmitted, false); assert.ok(q.processingError);
  await assert.rejects(() => import('node:fs/promises').then(fs => fs.access(audio)));
});
test('valid transcript without ffmpeg keeps speech metrics explicitly unavailable', async () => {
  const s = await active(); s.questions[0].isSubmitted = true; await withSessionLock(s._id, () => repo.save(s));
  const audio = join(tmpdir(), `${randomUUID()}.webm`); await writeFile(audio, 'fixture audio');
  ai.analyzeSpeech = async () => ({ transcript: 'Candidate answer', metrics: null, metrics_status: 'unavailable' });
  await service.evaluateAnswerAsync(io, owner, s._id, 0, 'code', 'js', audio, null);
  const q = (await repo.findById(s._id)).questions[0];
  assert.equal(q.speechMetricsStatus, 'unavailable'); assert.equal(q.speechMetrics, undefined); assert.equal(q.userAnswerText, 'Candidate answer');
});
test('four concurrent weak answers reserve at most two follow-ups', async () => {
  const s = await active(4); s.questions.forEach(q => { q.isSubmitted = true; }); await withSessionLock(s._id, () => repo.save(s));
  ai.evaluateAnswer = async () => ({ ...result, technical_score: 40 });
  const releases = [];
  ai.generateFollowUp = async () => { await new Promise(resolve => releases.push(resolve)); return { question: 'Probe', ideal_answer: 'Answer', question_type: 'oral' }; };
  const tasks = [0, 1, 2, 3].map(index => service.evaluateAnswerAsync(io, owner, s._id, index, 'code', 'js', null, null));
  await until(async () => releases.length === 2 && (await repo.findById(s._id)).questions.every(q => q.isEvaluated));
  await assert.rejects(() => service.endInterviewSession(s._id, owner, io), /Evaluation in progress/);
  releases.forEach(resolve => resolve()); await Promise.all(tasks);
  const final = await repo.findById(s._id);
  assert.equal(final.status, 'in-progress'); assert.equal(final.questions.filter(q => q.followUpOf !== undefined).length, 2);
  assert.ok(final.questions.every(q => !q.followUpPending));
});
test('essential Redis question XP buffer flushes once under concurrent syncs', async () => {
  const before = (await query('SELECT xp FROM users WHERE id=$1', [owner])).rows[0].xp;
  await redis.del(`user:${owner}:xp_buffer`);
  await game.addXP(owner, 'question_answered');
  await Promise.all([game.flushXP(owner), game.flushXP(owner)]);
  const now = (await query('SELECT xp FROM users WHERE id=$1', [owner])).rows[0].xp;
  assert.equal(now, before + XP_REWARDS.PERFECT_QUESTION);
  assert.equal(await redis.get(`user:${owner}:xp_buffer`), null);
});
test('Node 20 file-type detects the PNG used by whiteboard uploads', async () => {
  const { fileTypeFromBuffer } = await import('file-type');
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489', 'hex');
  assert.equal((await fileTypeFromBuffer(png)).mime, 'image/png');
});
