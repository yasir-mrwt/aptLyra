/** Reproduce the explicitly approved Phase 4 corpus in a disposable database.
 * This uses the real CLI and actual recorded user review, not fictional approvals.
 * It publishes nothing in a persistent/production environment. */
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile, mkdtemp, rm, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import pg from 'pg';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import request from 'supertest';

for (const key of ['DATABASE_URL','NEON_DATABASE_URL','REDIS_URL','UPSTASH_REDIS_URL']) {
  if (process.env[key]) throw new Error(`Unset ${key}: seed publication uses disposable localhost only`);
}
const hash=value=>createHash('sha256').update(value).digest('hex');
const seedPath=await realpath(fileURLToPath(new URL('../data/ingestion/junior-se-seed.json',import.meta.url)));
const packet=await readFile(new URL('../../docs/seed-review.md',import.meta.url));
const seed=await readFile(seedPath), documents=JSON.parse(seed).documents;
const attestation=JSON.parse(await readFile(new URL('../data/ingestion/seed-review-attestation.json',import.meta.url),'utf8'));
// These immutable authorization anchors come from the user's explicit review.
const approvedPacketHash='be9d40c94f1941374a7332fd4b15cbe940ab6cc4e58495b4a0877c40cfb7b7cd';
const linkedInputHash='b85d0e09bb94eaf6751a0ae3a86ffb1f76169ee4faf6e314b60f579cee69e995';
assert.equal(hash(packet),approvedPacketHash); assert.equal(hash(seed),linkedInputHash);
assert.equal(attestation.approvedArtifactHash,approvedPacketHash); assert.equal(attestation.linkedCorpusInputHash,linkedInputHash);
assert.equal(attestation.reviewer.name,'Muhammad Yasir'); assert.equal(attestation.reviewer.id,'muhammad-yasir');
assert.ok(packet.toString('utf8').includes(linkedInputHash)); assert.equal(documents.length,48);
for (const d of documents) {
  const q=d.questions[0]; assert.ok(packet.toString('utf8').includes(d.text));
  assert.ok(packet.toString('utf8').includes(`${q.category} / ${q.difficulty} / \`${q.primary}\``));
  assert.deepEqual(q.secondary,[]); assert.deepEqual(q.roles,['Software Engineer','Backend Developer','Full Stack Developer']);
  assert.equal(d.experience,null);
}
const connection='postgresql://techvera_test:techvera_local_fixture@127.0.0.1:15432/';
const admin=new pg.Pool({connectionString:connection+'techvera_test',ssl:false});
const database='techvera_reviewed_seed_'+randomUUID().replaceAll('-','');
const directory=await realpath(await mkdtemp(join(tmpdir(),'techvera-reviewed-seed-')));
const cli=fileURLToPath(new URL('../dist/ingestion/cli.js',import.meta.url));
const migration=fileURLToPath(new URL('../dist/database/migrate-cli.js',import.meta.url));
const execute=promisify(execFile);
const env={DATABASE_URL:connection+database,DATABASE_SSL:'false',NODE_ENV:'test'};
const invoke=async(args)=>JSON.parse((await execute(process.execPath,[cli,...args],{cwd:directory,env})).stdout.trim().split('\n').at(-1));
let db,apiPool;
try {
  await admin.query(`CREATE DATABASE ${database}`);
  await execute(process.execPath,[migration],{cwd:directory,env});
  await invoke(['register-reviewer',attestation.reviewer.id,attestation.reviewer.name,'human']);
  const config=JSON.parse(await readFile(new URL('../data/ingestion/seed-source-contract.json',import.meta.url),'utf8'));
  assert.deepEqual(config.approvedInputHashes,[linkedInputHash]); assert.equal(config.fixture,false);
  config.allowedInputs=[seedPath]; // Path portability does not broaden approved bytes.
  const configPath=join(directory,'contract.json'); await writeFile(configPath,JSON.stringify(config));
  const {sourceId}=await invoke(['register-source','techvera-junior-se-v1','TechVera original reviewed seed',configPath]);
  const summary=await invoke(['inspect-source',sourceId]);
  await invoke(['approve-source',sourceId,attestation.reviewer.id,summary.contractHash]);
  const {recordIds}=await invoke(['ingest',sourceId,seedPath]); assert.equal(recordIds.length,48);
  for (const id of recordIds) { const s=await invoke(['inspect',id]); assert.equal(s.state,'review_required'); assert.deepEqual(s.signals,[]); }
  const published=await invoke(['approve-batch',sourceId,linkedInputHash,attestation.reviewer.id]);
  assert.deepEqual(published,{documents:48,questions:48});
  const manifest=await invoke(['manifest']); assert.equal(manifest.reviewed.total,48); assert.equal(manifest.pending.total,0); assert.equal(manifest.fixtureCandidates,0);
  assert.equal(Object.keys(manifest.reviewed.roots).length,8); assert.ok(Object.values(manifest.reviewed.roots).every(n=>n===6));
  assert.equal(Object.keys(manifest.reviewed.children).length,24); assert.ok(Object.values(manifest.reviewed.children).every(n=>n===2));
  assert.ok(Object.values(manifest.reviewed.roles).every(n=>n===48));
  db=new pg.Pool({connectionString:connection+database,ssl:false});
  const audits=await db.query('SELECT reviewed_by,reviewed_at FROM question_versions WHERE status=$1',['published']);
  assert.ok(audits.rows.every(v=>v.reviewed_by===attestation.reviewer.id && v.reviewed_at));
  const reviewerUser=randomUUID();
  await db.query("INSERT INTO users(id,name,email,app_role) VALUES($1,$2,$3,'reviewer')",[reviewerUser,attestation.reviewer.name,'reviewer@example.invalid']);
  await db.query('UPDATE ingestion_reviewers SET user_id=$2 WHERE id=$1',[attestation.reviewer.id,reviewerUser]);
  process.env.DATABASE_URL=connection+database;process.env.DATABASE_SSL='false';process.env.NODE_ENV='test';
  process.env.JWT_SECRET='phase9-seed-fixture-secret';
  ({pool:apiPool}=await import('../dist/config/db.js'));
  const {embedCorpus}=await import('../dist/retrieval/corpus.js');
  const {MODEL}=await import('../dist/retrieval/contracts.js');
  const embedding=await embedCorpus({async embed(texts){return {...MODEL,processingMs:0,vectors:texts.map(()=>[1,...Array(383).fill(0)])};}});
  assert.equal(embedding.embedded,48,'the disposable fixture creates a compatible local embedding generation only');
  const {default:contentRoutes}=await import('../dist/routes/contentIntelligenceRoutes.js');
  const app=express();app.use(express.json());app.use(cookieParser());app.use('/api/content-intelligence',contentRoutes);
  const cookie=`jwt=${jwt.sign({id:reviewerUser},process.env.JWT_SECRET)}`;
  const seedReview=await request(app).get('/api/content-intelligence/seed-review').set('Cookie',cookie).expect(200);
  assert.equal(seedReview.body.length,48,'trusted hash review must find the 48 historical-alias seeds');
  const publishedQuestions=await request(app).get('/api/content-intelligence/published').set('Cookie',cookie);
  assert.equal(publishedQuestions.status,200,JSON.stringify(publishedQuestions.body));
  assert.equal(publishedQuestions.body.length,48,'published endpoint must expose published questions with readiness');
  assert.ok(publishedQuestions.body.every(row=>row.publication_class==='fresh/provisional'),JSON.stringify(publishedQuestions.body.slice(0,3).map(row=>({id:row.question_version_id,publication_class:row.publication_class}))));
  assert.equal((await db.query("SELECT count(*)::int AS n FROM question_technical_references WHERE state='approved'")).rows[0].n,0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM rubric_drafts')).rows[0].n,0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM content_scoring_review_events')).rows[0].n,0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM question_versions WHERE status=\'published\'')).rows[0].n,48);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM interview_experience_records')).rows[0].n,0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM rubric_versions')).rows[0].n,0);
  await writeFile('/tmp/techvera-phase4-reviewed-manifest.json',JSON.stringify({reviewArtifactHash:approvedPacketHash,inputHash:linkedInputHash,
    reviewer:attestation.reviewer,validation:'Real CLI, fresh disposable PostgreSQL; no production import',manifest},null,2)+'\n');
  console.log('PASS: 48 trusted-hash seeds surfaced through the historical source alias; published API reports fresh/provisional; no references, rubrics, or scoring approvals were fabricated.');
} finally {
  if(apiPool) await apiPool.end();
  if(db) await db.end();
  try {await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);} finally {await admin.end(); await rm(directory,{recursive:true,force:true});}
}
