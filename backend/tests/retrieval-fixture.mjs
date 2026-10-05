/** Actual exact-hash approval reused only in fresh localhost disposable databases. */
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import pg from 'pg';

export async function fixture() {
  for(const key of ['DATABASE_URL','NEON_DATABASE_URL','REDIS_URL','UPSTASH_REDIS_URL'])
    if(process.env[key])throw new Error(`Unset ${key}: retrieval verification uses disposable localhost only`);
  const connection='postgresql://techvera_test:techvera_local_fixture@127.0.0.1:15432/';
  const database='techvera_phase5_'+randomUUID().replaceAll('-','');
  const admin=new pg.Pool({connectionString:connection+'techvera_test',ssl:false});
  await admin.query(`CREATE DATABASE ${database}`);
  process.env.DATABASE_URL=connection+database;process.env.DATABASE_SSL='false';process.env.NODE_ENV='test';
  let pool;
  const cleanup=async()=>{try{if(pool)await pool.end();}finally{try{await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);}finally{await admin.end();delete process.env.DATABASE_URL;}}};
  try {
    const db=await import('../dist/config/db.js');pool=db.pool;
    const {runMigrations}=await import('../dist/database/migrations.js');await runMigrations(pool);
    const {ingestionRepository:r}=await import('../dist/repositories/ingestionRepository.js');
    const seedPath=await realpath(fileURLToPath(new URL('../data/ingestion/junior-se-seed.json',import.meta.url)));
    const hash=b=>createHash('sha256').update(b).digest('hex');
    const corpus=await readFile(seedPath);
    assert.equal(hash(corpus),'b85d0e09bb94eaf6751a0ae3a86ffb1f76169ee4faf6e314b60f579cee69e995');
    assert.equal(hash(await readFile(new URL('../../docs/seed-review.md',import.meta.url))),'be9d40c94f1941374a7332fd4b15cbe940ab6cc4e58495b4a0877c40cfb7b7cd');
    const attestation=JSON.parse(await readFile(new URL('../data/ingestion/seed-review-attestation.json',import.meta.url)));
    assert.equal(attestation.reviewer.id,'muhammad-yasir');
    await r.registerReviewer(attestation.reviewer.id,attestation.reviewer.name,'human');
    const contract=JSON.parse(await readFile(new URL('../data/ingestion/seed-source-contract.json',import.meta.url)));
    contract.allowedInputs=[seedPath];assert.equal(contract.fixture,false);
    assert.deepEqual(contract.approvedInputHashes,[hash(corpus)]);
    const sourceId=await r.registerSource('techvera-junior-se-seed-v1','TechVera original reviewed seed',contract);
    await r.approveSource(sourceId,attestation.reviewer.id,(await r.inspectSource(sourceId)).contractHash);
    await r.ingestFile(sourceId,seedPath);
    assert.deepEqual(await r.approveBatch(sourceId,hash(corpus),attestation.reviewer.id),{documents:48,questions:48});
    return {...db,r,sourceId,cleanup,database,admin,connection};
  }catch(error){await cleanup();throw error;}
}
