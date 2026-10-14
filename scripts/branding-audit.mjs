/** Reject current branding leaks while retaining documented compatibility and attribution. */
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, relative } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const legacy = /techvera|tech vera|\bava\b|preptalk|prep talk|prep-talk/i;
let checked = 0;
const failures = [];
async function inspect(path) {
  const entries = await readdir(path, { withFileTypes: true });
  for (const entry of entries) {
    const file = resolve(path, entry.name);
    if (entry.isDirectory()) { await inspect(file); continue; }
    if (!/\.(tsx?|py)$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue;
    const name = relative(root, file);
    let text = await readFile(file, 'utf8');
    if (name === 'frontend/src/hooks/useInterviewerVoice.ts') text = text.replaceAll('preptalk_interviewer_muted', 'persisted_mute_key');
    if (name === 'backend/controllers/userController.ts') text = text.replaceAll('preptalk/avatars', 'persisted_asset_namespace');
    checked++;
    if (legacy.test(text)) failures.push(name);
  }
}
for (const directory of ['frontend/src', 'backend/services', 'backend/config', 'backend/controllers', 'backend/models', 'backend/planner', 'backend/runtime', 'backend/routes', 'ai-service/app']) {
  await inspect(resolve(root, directory));
}
for (const name of ['frontend/index.html', 'frontend/public/logo.svg', 'ai-service/main.py']) {
  checked++;
  if (legacy.test(await readFile(resolve(root, name), 'utf8'))) failures.push(name);
}
// Legal notices, reviewed bytes, migrations and dependency resolutions must remain exact.
const protectedFiles = [ 'THIRD_PARTY_NOTICES.md', 'ai-service/requirements.txt', 'docs/seed-review.md',
  ...(await readdir(resolve(root, 'backend/migrations'))).filter(name=>/^00[1-7]_/.test(name)).map(name => `backend/migrations/${name}`),
  ...(await readdir(resolve(root, 'backend/data/ingestion'))).map(name => `backend/data/ingestion/${name}`)];
const license=await readFile(resolve(root,'LICENSE'),'utf8');
const upstreamHash='eb2eafda206b3fca205051e93d50f06006af11d292dd1b3dff46eb307962999a';
if(createHash('sha256').update(license.replace('Copyright (c) 2026 Muhammad Yasir (original Aptlyra contributions)\n','')).digest('hex')!==upstreamHash || !license.includes('Copyright (c) 2026 Muhammad Yasir (original Aptlyra contributions)')) failures.push('MIT/upstream notice or scoped Aptlyra attribution changed');
for (const name of protectedFiles) {
  const baseline = execFileSync('git', ['show', `HEAD:${name}`], { cwd: root });
  if (!baseline.equals(await readFile(resolve(root, name)))) failures.push(`protected bytes changed: ${name}`);
}
for(const scope of ['backend','frontend']){
  const name=`${scope}/package-lock.json`,baseline=JSON.parse(execFileSync('git',['show',`HEAD:${name}`],{cwd:root})),current=JSON.parse(await readFile(resolve(root,name),'utf8'));
  if(current.name!==`aptlyra-${scope}` || current.packages[''].name!==`aptlyra-${scope}`)failures.push(`package identity: ${name}`);
  baseline.name=current.name;baseline.packages[''].name=current.packages[''].name;
  // Approved hero renderer addition; every existing resolution must still match.
  // Once committed it is part of HEAD and receives the normal exact-byte check.
  if(scope==='frontend'&&!baseline.packages['node_modules/lottie-web']){
    baseline.packages[''].dependencies['lottie-web']='5.13.0';
    const addition={version:'5.13.0',resolved:'https://registry.npmjs.org/lottie-web/-/lottie-web-5.13.0.tgz',integrity:'sha512-+gfBXl6sxXMPe8tKQm7qzLnUy5DUPJPKIyRHwtpCpyUEYjHYRJC/5gjUvdkuO2c3JllrPtHXH5UJJK8LRYl5yQ==',license:'MIT'};
    baseline.packages['node_modules/lottie-web']=addition;
    // npm keeps package/dependency keys sorted; compare the same canonical order.
    baseline.packages=Object.fromEntries(Object.entries(baseline.packages).sort(([a],[b])=>a.localeCompare(b,'en')));
    current.packages=Object.fromEntries(Object.entries(current.packages).sort(([a],[b])=>a.localeCompare(b,'en')));
    baseline.packages[''].dependencies=Object.fromEntries(Object.entries(baseline.packages[''].dependencies).sort());
    current.packages[''].dependencies=Object.fromEntries(Object.entries(current.packages[''].dependencies).sort());
  }

  if(JSON.stringify(baseline)!==JSON.stringify(current))failures.push(`dependency resolutions changed: ${name}`);
  if(JSON.parse(await readFile(resolve(root,`${scope}/package.json`),'utf8')).name!==`aptlyra-${scope}`)failures.push(`package identity: ${scope}`);
}
if (failures.length) {
  console.error(JSON.stringify({ failures }));
  process.exitCode = 1;
} else console.log(`PASS: ${checked} current source files; ${protectedFiles.length} legal, corpus, migration and dependency artifacts preserved`);
