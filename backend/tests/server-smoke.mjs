/** Boots the real server using disposable test stores and an isolated upload cwd. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
for (const key of ['DATABASE_URL', 'NEON_DATABASE_URL', 'REDIS_URL', 'UPSTASH_REDIS_URL']) {
  if (process.env[key]) throw new Error(`Unset ${key}: smoke checks use only the disposable localhost fixtures`);
}
const work = await mkdtemp(join(tmpdir(), 'techvera-server-smoke-'));
const env = { ...process.env, NODE_ENV: 'test', PORT: '15001',
  DATABASE_URL: 'postgresql://techvera_test:techvera_local_fixture@127.0.0.1:15432/techvera_test', DATABASE_SSL: 'false',
  REDIS_URL: 'redis://127.0.0.1:16379/14', FRONTEND_URL: 'http://localhost:5173',
  AI_SERVICE_URL: 'http://127.0.0.1:18000', INTERNAL_API_KEY: 'fixture-internal-key', JWT_SECRET: 'fixture-only-jwt-secret',
  GOOGLE_CLIENT_ID: 'fixture', GOOGLE_CLIENT_SECRET: 'fixture', CLOUDINARY_CLOUD_NAME: 'fixture',
  CLOUDINARY_API_KEY: 'fixture', CLOUDINARY_API_SECRET: 'fixture' };
const child = spawn(process.execPath, [fileURLToPath(new URL('../dist/server.js', import.meta.url))], { cwd: work, env, stdio: 'pipe' });
let logs = ''; child.stdout.on('data', chunk => { logs += chunk; }); child.stderr.on('data', chunk => { logs += chunk; });
const exit = new Promise(resolve => child.once('exit', resolve));
try {
  let response;
  for (let n = 0; n < 100; n++) {
    if (child.exitCode !== null) throw new Error(`Server startup failed: ${logs}`);
    try { response = await fetch('http://127.0.0.1:15001/health', { signal: AbortSignal.timeout(1000) }); if (response.ok) break; } catch { /* awaiting listener */ }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(response?.status, 200);
  assert.equal((await response.json()).status, 'ok');
  assert.equal((await fetch('http://127.0.0.1:15001/api/sessions')).status, 401);
  const url = 'http://127.0.0.1:15001/api/resume/webhook/process-resume/12345678-1234-1234-1234-123456789abc';
  assert.equal((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
  assert.equal((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': env.INTERNAL_API_KEY }, body: '{}' })).status, 400);
  console.log('PASS: real Node 20 server startup, SQL/Redis health, user authentication and protected callback routing');
} finally {
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 2000);
  await exit; clearTimeout(timer); await rm(work, { recursive: true, force: true });
}
