import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { cp, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import pg from 'pg';
import { runMigrations, migrationDirectory } from '../dist/database/migrations.js';

for (const key of ['DATABASE_URL','NEON_DATABASE_URL','REDIS_URL','UPSTASH_REDIS_URL']) {
  if (process.env[key]) throw new Error(`Unset ${key}: admin RBAC tests use disposable localhost fixtures only`);
}
const fixture='postgresql://techvera_test:techvera_local_fixture@127.0.0.1:15432/techvera_test';
const adminPool=new pg.Pool({connectionString:fixture,ssl:false});
const dbName=`aptlyra_admin_${randomUUID().replaceAll('-','')}`;
let pool,query,roles,app,actor,adminId,reviewerId,userId,plainUserId;
const secret='phase9-rbac-fixture-secret';
const tokenFor=id=>jwt.sign({id},secret);

before(async()=>{
  await adminPool.query(`CREATE DATABASE ${dbName}`);
  const db=new pg.Pool({connectionString:fixture.replace(/\/[^/]+$/,'/'+dbName),ssl:false});
  pool=db; process.env.DATABASE_URL=fixture.replace(/\/[^/]+$/,'/'+dbName); process.env.DATABASE_SSL='false';
  process.env.NODE_ENV='test'; process.env.JWT_SECRET=secret;
  ({query}=await import('../dist/config/db.js'));
  ({roleManagement:roles}=await import('../dist/admin/roleManagement.js'));
  // Apply 001–011 first so the legacy linked reviewer exists before RBAC migration 012.
  const prefix=await mkdtemp(join(tmpdir(),'aptlyra-rbac-migrations-'));
  try {
    const names=(await readdir(migrationDirectory)).filter(name=>name.endsWith('.sql')).sort().slice(0,11);
    for(const name of names) await cp(join(migrationDirectory,name),join(prefix,name));
    await runMigrations(pool,prefix);
    actor=randomUUID(); adminId=randomUUID(); reviewerId=randomUUID(); userId=randomUUID(); plainUserId=randomUUID();
    await query('INSERT INTO users(id,name,email) VALUES($1,$2,$3),($4,$5,$6),($7,$8,$9),($10,$11,$12),($13,$14,$15)',
      [actor,'Owner fixture','owner@example.invalid',adminId,'Admin fixture','admin@example.invalid',reviewerId,'Reviewer fixture','reviewer@example.invalid',userId,'User fixture','user@example.invalid',plainUserId,'Plain user fixture','plain@example.invalid']);
    await query("INSERT INTO ingestion_reviewers(id,display_name,kind,enabled,user_id) VALUES('legacy-human','Legacy reviewer','human',true,$1)",[reviewerId]);
    await runMigrations(pool);
  } finally { await rm(prefix,{recursive:true,force:true}); }
  assert.equal((await roles.current(actor)).role,'user','migration never promotes the first registered account');
  assert.equal((await roles.current(reviewerId)).role,'reviewer','migration preserves linked human reviewer access');
  assert.equal((await roles.current(reviewerId)).reviewerLinked,true);
  const { default:adminRoutes }=await import('../dist/admin/routes.js');
  const { default:contentRoutes }=await import('../dist/routes/contentIntelligenceRoutes.js');
  app=express(); app.use(express.json()); app.use(cookieParser()); app.use('/api/admin',adminRoutes); app.use('/api/content-intelligence',contentRoutes);
});

after(async()=>{if(pool)await pool.end();try{await adminPool.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);}finally{await adminPool.end();}});

test('bootstrap is explicit, role APIs enforce boundaries, preserve reviewer identity, and audit changes',async()=>{
  await assert.rejects(()=>roles.bootstrapInitialOwner('owner@example.invalid','different@example.invalid'),/owner-bootstrap-confirmation-required/);
  await assert.rejects(()=>roles.team(actor),/role-forbidden/);
  await assert.rejects(()=>roles.bootstrapInitialOwner('missing@example.invalid','missing@example.invalid'),/user-not-found/);
  const boot=await roles.bootstrapInitialOwner('owner@example.invalid','owner@example.invalid');
  assert.equal(boot.role,'owner');
  await assert.rejects(()=>roles.bootstrapInitialOwner('user@example.invalid','user@example.invalid'),/initial-owner-already-assigned/);

  const call=(id,method,path)=>request(app)[method](path).set('Cookie',`jwt=${tokenFor(id)}`);
  const ownerId=actor;
  const team=await call(ownerId,'get','/api/admin/team').expect(200);
  assert.equal(team.body.length,5);
  await call(ownerId,'patch',`/api/admin/team/${adminId}/role`).send({role:'admin'}).expect(200);
  await call(ownerId,'patch',`/api/admin/team/${userId}/role`).send({role:'reviewer'}).expect(200);
  const linkedBefore=(await query("SELECT id FROM ingestion_reviewers WHERE user_id=$1",[reviewerId])).rows[0].id;
  await call(ownerId,'patch',`/api/admin/team/${reviewerId}/role`).send({role:'user'}).expect(200);
  const linkedAfter=(await query("SELECT id,enabled FROM ingestion_reviewers WHERE user_id=$1",[reviewerId])).rows[0];
  assert.equal(linkedAfter.id,linkedBefore); assert.equal(linkedAfter.enabled,false);
  await call(ownerId,'patch',`/api/admin/team/${reviewerId}/role`).send({role:'reviewer'}).expect(200);

  await call(adminId,'get','/api/admin/team').expect(200);
  await call(adminId,'patch',`/api/admin/team/${userId}/role`).send({role:'admin'}).expect(403);
  await call(adminId,'patch',`/api/admin/team/${userId}/role`).send({role:'reviewer'}).expect(200);
  await call(adminId,'patch',`/api/admin/team/${userId}/role`).send({role:'user'}).expect(200);
  await call(adminId,'patch',`/api/admin/team/${userId}/role`).send({role:'reviewer'}).expect(200);
  await call(adminId,'post','/api/admin/owner/transfer').send({targetUserId:reviewerId}).expect(403);

  await call(reviewerId,'get','/api/admin/team').expect(403);
  await call(reviewerId,'get','/api/content-intelligence/sources').expect(403);
  await call(reviewerId,'get','/api/content-intelligence/seed-review').expect(200);
  await call(plainUserId,'get','/api/admin/me').expect(200);
  await call(plainUserId,'get','/api/admin/team').expect(403);
  await call(plainUserId,'get','/api/content-intelligence/seed-review').expect(403);
  await call(plainUserId,'get','/api/content-intelligence/sources').expect(403);

  const transfer=await call(ownerId,'post','/api/admin/owner/transfer').send({targetUserId:adminId}).expect(200);
  assert.equal(transfer.body.ownerId,adminId);
  await call(ownerId,'post','/api/admin/owner/transfer').send({targetUserId:reviewerId}).expect(403);
  assert.equal((await roles.current(adminId)).role,'owner');
  assert.equal((await roles.current(actor)).role,'admin');
  const audit=(await query('SELECT action,previous_role,new_role FROM user_role_audit ORDER BY created_at,id')).rows;
  assert.ok(audit.some(row=>row.action==='initial_owner_bootstrap'));
  assert.ok(audit.some(row=>row.action==='access_removed'&&row.previous_role==='reviewer'&&row.new_role==='user'));
  assert.equal(audit.filter(row=>row.action==='ownership_transferred').length,2);
  await assert.rejects(()=>query('UPDATE user_role_audit SET reason=\'tampered\''),/append-only/);
});
