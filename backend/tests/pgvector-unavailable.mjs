import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {runMigrations} from '../dist/database/migrations.js';
for(const k of ['DATABASE_URL','NEON_DATABASE_URL','REDIS_URL','UPSTASH_REDIS_URL'])
  if(process.env[k])throw new Error(`Unset ${k}: unsupported-extension verification is localhost-only`);
const base='postgresql://techvera_test:techvera_local_fixture@127.0.0.1:15433/';
const admin=new pg.Pool({connectionString:base+'techvera_test',ssl:false});
const name='techvera_no_vector_'+randomUUID().replaceAll('-','');let pool;
try {
  await admin.query(`CREATE DATABASE ${name}`);pool=new pg.Pool({connectionString:base+name,ssl:false});
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM pg_available_extensions WHERE name='vector'")).rows[0].n,0);
  await assert.rejects(()=>runMigrations(pool),e=>e.message.includes('005_pgvector_retrieval.sql rolled back (55000); pgvector must be installed') && e.cause.message.includes('TechVera requires pgvector'));
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n,4);
  assert.equal((await pool.query("SELECT to_regclass('embedding_vectors') AS name")).rows[0].name,null);
  console.log('PASS: stock PostgreSQL rejects Phase 5 clearly; migration 005 and its history roll back atomically.');
}finally{try{if(pool)await pool.end();await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);}finally{await admin.end();}}
