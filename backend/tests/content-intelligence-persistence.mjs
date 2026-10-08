/** Phase 8.5 persistence checks against only an isolated disposable local PostgreSQL database. */
import assert from 'node:assert/strict';
import { randomUUID,createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { test, before, after } from 'node:test';
import pg from 'pg';
for (const key of ['DATABASE_URL','NEON_DATABASE_URL','REDIS_URL','UPSTASH_REDIS_URL']) {
  if (process.env[key]) throw new Error(`Unset ${key}: content intelligence tests use only disposable localhost fixtures`);
}
const fixtureUrl='postgresql://techvera_test:techvera_local_fixture@127.0.0.1:15432/techvera_test';
const admin=new pg.Pool({connectionString:fixtureUrl,ssl:false});
const dbName='aptlyra_content_'+randomUUID().replaceAll('-','');
const first=randomUUID(),second=randomUUID();
const until=async(fn,label)=>{const end=Date.now()+10_000;while(Date.now()<end){const value=await fn();if(value)return value;await new Promise(resolve=>setTimeout(resolve,20));}throw new Error(`${label} did not complete`);};
let pool,query,service,operations,migrations,record,runMigrations;
before(async()=>{
  await admin.query(`CREATE DATABASE ${dbName}`);
  process.env.DATABASE_URL=fixtureUrl.replace(/\/[^/]+$/,'/'+dbName);
  process.env.DATABASE_SSL='false';process.env.REDIS_URL='redis://127.0.0.1:16379/14';process.env.NODE_ENV='test';
  ({pool,query}=await import('../dist/config/db.js'));
  ({runMigrations}=await import('../dist/database/migrations.js'));
  ({contentSubmissions:service}=await import('../dist/contentIntelligence/submissions.js'));
  ({contentOperations:operations}=await import('../dist/runtime/contentOperations.js'));
  migrations=await runMigrations(pool);
  for(const id of [first,second])await query('INSERT INTO users(id,name,email) VALUES($1,$2,$3)',[id,'Fixture',`${id}@example.invalid`]);
});
after(async()=>{
  try{
    if(pool)await pool.end();
    await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    const {default:redis}=await import('../dist/config/redisConfig.js');redis.disconnect();
  }
  finally{await admin.end();}
});
test('migration 009 applies and consented submissions remain quarantined and owner-scoped',async()=>{
  assert.ok(migrations.applied.includes('009_dynamic_interview_intelligence.sql'));
  record=await service.create(first,{role:'Backend Developer',occurredOn:null,roundType:'technical',topics:['SQL indexing'],
    questions:['How does an index affect a query plan?'],practiceConsent:true,rightToShare:true,anonymizedResearchConsent:false});
  assert.equal(record.state,'quarantined');
  assert.equal((await service.listMine(first)).length,1);
  assert.equal((await service.listMine(second)).length,0);
  const row=(await query(`SELECT r.state,s.state AS source_state,s.source_type,s.model_processing_allowed,v.status,v.normalized_text,
    e.company_label,e.practice_consent,e.right_to_share,e.submitter_user_id
    FROM ingestion_records r JOIN sources s ON s.id=r.source_id JOIN source_document_versions v ON v.id=r.document_version_id
    JOIN interview_experience_records e ON e.document_version_id=v.id WHERE r.id=$1`,[record.id])).rows[0];
  assert.equal(row.state,'review_required');assert.equal(row.source_state,'disabled');assert.equal(row.source_type,'user_submission');
  assert.equal(row.model_processing_allowed,false);assert.equal(row.status,'quarantined');assert.equal(row.company_label,null);
  assert.equal(row.practice_consent,true);assert.equal(row.right_to_share,true);assert.equal(row.submitter_user_id,first);
  assert.match(row.normalized_text,/SQL indexing/);
  assert.equal((await query('SELECT count(*)::int AS n FROM question_versions')).rows[0].n,0);
  assert.equal((await query("SELECT count(*)::int AS n FROM retrieval_entities WHERE purpose='question-selection'")).rows[0].n,0);
  const source=(await query('SELECT source_id FROM ingestion_records WHERE id=$1',[record.id])).rows[0].source_id;
  const input={type:'source_collection',scopeType:'source',scopeId:source,sourceId:source,idempotencyKey:'fixture-collect-1',payload:{path:'/fixture/approved.json'}};
  await assert.rejects(()=>operations.enqueue(input),/source_permission_required/);
  await query(`UPDATE sources SET state='enabled',permission_status='permitted',review_status='approved',permission_basis='fixture-only',
    permission_evidence='Fictional disposable fixture',permission_evidence_hash=$2,terms_revision='fixture-review-v1',
    reviewed_by='Fixture reviewer',reviewed_at=now() WHERE id=$1`,[source,'f'.repeat(64)]);
  const operation=await operations.enqueue(input);
  assert.equal(operation.runtime_version,'aptlyra-content-v1');assert.equal(operation.session_id,null);
  assert.equal(operation.scope_type,'source');assert.equal(operation.scope_id,source);
  const repeated=await operations.enqueue(input);assert.equal(repeated.id,operation.id);
  await assert.rejects(()=>operations.enqueue({...input,payload:{path:'/fixture/changed.json'}}),/idempotency_payload_conflict/);
  const outbox=(await query('SELECT operation_id,session_id,scope_type,scope_id FROM transactional_outbox WHERE operation_id=$1',[operation.id])).rows[0];
  assert.equal(outbox.operation_id,operation.id);assert.equal(outbox.session_id,null);
  assert.equal(outbox.scope_type,'source');assert.equal(outbox.scope_id,source);
  const {InterviewRuntime}=await import('../dist/runtime/worker.js');
  let calls=0;
  const runtime=new InterviewRuntime({contentHandlers:{source_collection:async()=>{calls++;return {fixtureRecords:1};}}});
  try{
    await runtime.process(operation.id);
    await runtime.process(operation.id);
    const completed=(await query('SELECT status,result,lease_owner,lease_token FROM durable_operations WHERE id=$1',[operation.id])).rows[0];
    assert.equal(completed.status,'succeeded');assert.deepEqual(completed.result,{fixtureRecords:1});
    assert.equal(completed.lease_owner,null);assert.equal(completed.lease_token,null);assert.equal(calls,1);
    assert.equal((await query('SELECT status FROM transactional_outbox WHERE operation_id=$1',[operation.id])).rows[0].status,'published');
  }finally{await runtime.stop();}
});
test('source registry is linked-reviewer only and permission approval is bound to exact config evidence',async()=>{
  const {sourceRegistry}=await import('../dist/contentIntelligence/sourceRegistry.js');
  await query("INSERT INTO ingestion_reviewers(id,display_name,kind,user_id) VALUES('registry-human','Registry reviewer','human',$1)",[first]);
  await query("UPDATE users SET app_role='admin' WHERE id=$1",[first]);
  const input={sourceType:'rss_atom',name:'Fictional fixture feed',baseUrl:'https://feed.example.invalid/rss',termsUrl:'https://feed.example.invalid/terms',
    permissionBasis:'written test fixture grant',permissionEvidence:'fictional deterministic test source; no network request is made',attribution:'Aptlyra test fixture',
    allowedHosts:['feed.example.invalid'],allowedPaths:['/rss'],intervalMinutes:60,rawRetentionDays:7,fullTextStorage:true,derivedDataStorage:true,modelProcessingAllowed:false};
  await assert.rejects(()=>sourceRegistry.create(second,input),/reviewer-not-authorized/);
  const created=await sourceRegistry.create(first,input);
  assert.equal(created.state,'disabled');
  const source=await sourceRegistry.get(first,created.id);
  await assert.rejects(()=>sourceRegistry.setEnabled(first,created.id,true),/source-permission-required/);
  await assert.rejects(()=>sourceRegistry.reviewPermission(first,created.id,'f'.repeat(64)),/permission-hash-mismatch/);
  await sourceRegistry.reviewPermission(first,created.id,source.permission_evidence_hash);
  await sourceRegistry.setEnabled(first,created.id,true);
  assert.equal((await sourceRegistry.get(first,created.id)).state,'enabled');
  const op=await sourceRegistry.collect(first,created.id,'manual');
  assert.equal(op.status,'queued');
  const update=await sourceRegistry.update(first,created.id,{...input,baseUrl:'https://feed.example.invalid/changed',allowedPaths:['/changed']});
  assert.equal(update.permissionReviewRequired,true);assert.equal(update.state,'disabled');
  await assert.rejects(()=>sourceRegistry.collect(first,created.id),/source-permission-required/);
  await assert.rejects(()=>sourceRegistry.collect(second,created.id),/reviewer-not-authorized/);
  await sourceRegistry.withdraw(first,created.id,'fixture permission withdrawn');
  assert.equal((await query('SELECT status,error_code FROM durable_operations WHERE id=$1',[op.operationId])).rows[0].status,'terminal_failed');
  assert.equal((await query('SELECT status,safe_error_category FROM source_collection_runs WHERE operation_id=$1',[op.operationId])).rows[0].status,'cancelled');
  await assert.rejects(()=>sourceRegistry.collect(first,created.id),/source-permission-required/);
});
test('permission expiry blocks collection and trends until the exact current configuration is re-reviewed',async()=>{
  const {sourceRegistry}=await import('../dist/contentIntelligence/sourceRegistry.js');
  const {contentTrends}=await import('../dist/contentIntelligence/trends.js');
  const input={sourceType:'rss_atom',name:'Expiring fictional feed',baseUrl:'https://expiry.example.invalid/rss',termsUrl:'https://expiry.example.invalid/terms',
    permissionBasis:'fixture permission with explicit expiry',permissionEvidence:'disposable fictional source; never contacted',attribution:'fixture',
    allowedHosts:['expiry.example.invalid'],allowedPaths:['/rss'],intervalMinutes:60,rawRetentionDays:7,fullTextStorage:true,
    derivedDataStorage:true,modelProcessingAllowed:false,permissionExpiresAt:new Date(Date.now()+86_400_000).toISOString()};
  const created=await sourceRegistry.create(first,input),current=await sourceRegistry.get(first,created.id);
  await sourceRegistry.reviewPermission(first,created.id,current.permission_evidence_hash);
  await sourceRegistry.setEnabled(first,created.id,true);
  await query('UPDATE sources SET permission_expires_at=now()-interval \'1 second\',next_due_at=now()-interval \'1 hour\' WHERE id=$1',[created.id]);
  await assert.rejects(()=>sourceRegistry.collect(first,created.id),/source-permission-required/);
  await assert.rejects(()=>sourceRegistry.reviewPermission(first,created.id,current.permission_evidence_hash),/source-permission-expired/);
  const {scheduleDueSources}=await import('../dist/contentIntelligence/sourceRegistry.js');
  const before=(await query('SELECT count(*)::int AS n FROM source_collection_runs WHERE source_id=$1',[created.id])).rows[0].n;
  await scheduleDueSources();
  assert.equal((await query('SELECT count(*)::int AS n FROM source_collection_runs WHERE source_id=$1',[created.id])).rows[0].n,before);
  const renewed={...input,permissionExpiresAt:new Date(Date.now()+7*86_400_000).toISOString()};
  const changed=await sourceRegistry.update(first,created.id,renewed);
  assert.equal(changed.permissionReviewRequired,true);
  await assert.rejects(()=>sourceRegistry.setEnabled(first,created.id,true),/source-permission-required/);
  const recheck=await sourceRegistry.get(first,created.id);
  await sourceRegistry.reviewPermission(first,created.id,recheck.permission_evidence_hash);
  await sourceRegistry.setEnabled(first,created.id,true);
  assert.equal((await sourceRegistry.get(first,created.id)).permission_reviewed_hash,recheck.permission_evidence_hash);
  assert.deepEqual(await contentTrends.list(first,90),[]);
});
test('trend windows collapse repost hashes, count independent evidence, preserve null provenance, and age evidence deterministically',async()=>{
  const {sourceRegistry}=await import('../dist/contentIntelligence/sourceRegistry.js');
  const {contentTrends}=await import('../dist/contentIntelligence/trends.js');
  const reviewer=(await query("SELECT id FROM ingestion_reviewers WHERE user_id=$1 AND enabled AND kind='human' LIMIT 1",[first])).rows[0].id;
  const sources=[];
  async function addSignal({days,content,topic='phase85-trend-matrix',role='Backend Developer',company=null}){
    const token=randomUUID().replaceAll('-','').slice(0,10),base=`https://trend-${token}.example.invalid/feed`;
    const config={sourceType:'official_api',name:`Fictional trend ${token}`,baseUrl:base,termsUrl:`https://trend-${token}.example.invalid/terms`,
      permissionBasis:'disposable deterministic trend fixture',permissionEvidence:'fictional locally authored test data only',attribution:'fixture',
      allowedHosts:[`trend-${token}.example.invalid`],allowedPaths:['/feed'],intervalMinutes:60,rawRetentionDays:7,fullTextStorage:true,
      derivedDataStorage:true,modelProcessingAllowed:false};
    const created=await sourceRegistry.create(first,config),state=await sourceRegistry.get(first,created.id);
    await sourceRegistry.reviewPermission(first,created.id,state.permission_evidence_hash);await sourceRegistry.setEnabled(first,created.id,true);
    const [doc,version,record]=[randomUUID(),randomUUID(),randomUUID()],hash=createHash('sha256').update(content).digest('hex');
    const date=new Date(Date.now()-days*86_400_000).toISOString().slice(0,10),text=`Fictional interview report: ${content}`;
    await query('INSERT INTO source_documents(id,source_id,external_key) VALUES($1,$2,$3)',[doc,created.id,`trend-${token}`]);
    await query(`INSERT INTO source_document_versions(id,document_id,version,title,occurred_at,published_at,fetched_at,reviewed_at,reviewed_by,
      content_hash,normalized_text,policy_revision,permission_status,review_status,quality,pii_status,confidentiality_status,status)
      VALUES($1,$2,1,$3,$4::date,$4::date,now(),now(),$5,$6,$7,'fixture-policy-v1','permitted','approved','reported-experience','clear','clear','published')`,
    [version,doc,`Fictional report ${token}`,date,reviewer,hash,text]);
    await query(`INSERT INTO ingestion_records(id,source_id,document_version_id,input_hash,state,reviewed_by,reviewed_at,created_at)
      VALUES($1,$2,$3,$4,'published',$5,now(),now())`,[record,created.id,version,hash,reviewer]);
    await query(`INSERT INTO interview_experience_records(document_version_id,company_label,role,occurred_on,submitter_type,consent_evidence,permission_revision,round_type,topics)
      VALUES($1,$2,$3,$4::date,'permission-approved-report','Fictional test provenance','fixture-v1','technical',$5)`,
    [version,company,role,date,JSON.stringify([topic])]);
    await query(`INSERT INTO ingestion_review_events(id,source_id,record_id,reviewer_id,action,content_hash,reason_code)
      VALUES($1,$2,$3,$4,'published',$5,'fixture-reviewed')`,[randomUUID(),created.id,record,reviewer,hash]);
    sources.push(created.id);return {sourceId:created.id,recordId:record,hash};
  }
  const fresh=await addSignal({days:5,content:'same reposted report'});
  await addSignal({days:4,content:'same reposted report'});
  await addSignal({days:10,content:'independent report'});
  await addSignal({days:45,content:'mid-window report'});
  await addSignal({days:120,content:'long-window report'});
  await addSignal({days:200,content:'expired-window report'});
  await addSignal({days:1,content:'recent decay evidence',topic:'phase85-recent-decay'});
  await addSignal({days:30,content:'old decay evidence',topic:'phase85-old-decay'});
  await addSignal({days:3,content:'different role report',role:'Software Engineer'});
  const d30=(await contentTrends.list(first,30,'Backend Developer')).find(x=>x.topic==='phase85-trend-matrix');
  const d90=(await contentTrends.list(first,90,'Backend Developer')).find(x=>x.topic==='phase85-trend-matrix');
  const d180=(await contentTrends.list(first,180,'Backend Developer')).find(x=>x.topic==='phase85-trend-matrix');
  assert.equal(d30.distinctRecords,2);assert.equal(d30.independentSources,2);
  assert.equal(d90.distinctRecords,3);assert.equal(d90.independentSources,3);
  assert.equal(d180.distinctRecords,4);assert.equal(d180.independentSources,4);
  assert.equal(d30.company,null);assert.equal(d90.role,'Backend Developer');
  assert.deepEqual(await contentTrends.list(first,90,'Software Engineer').then(rows=>rows.filter(x=>x.topic==='phase85-trend-matrix').map(x=>x.distinctRecords)),[1]);
  assert.deepEqual(await contentTrends.list(first,90,'Backend Developer','Unproven company').then(rows=>rows.filter(x=>x.topic==='phase85-trend-matrix')) ,[]);
  const recent=(await contentTrends.list(first,90)).find(x=>x.topic==='phase85-recent-decay');
  const old=(await contentTrends.list(first,90)).find(x=>x.topic==='phase85-old-decay');
  assert.ok(recent.trendStrength>old.trendStrength);
  assert.equal(d180.evidenceRecordHashes.includes(fresh.hash),true);
  await sourceRegistry.withdraw(first,sources[2],'fictional source withdrawn for trend test');
  const afterWithdrawal=(await contentTrends.list(first,90,'Backend Developer')).find(x=>x.topic==='phase85-trend-matrix');
  assert.equal(afterWithdrawal.distinctRecords,2);assert.equal(afterWithdrawal.independentSources,2);
  assert.equal((await query("SELECT count(*)::int AS n FROM ingestion_review_events WHERE source_id=$1 AND action='published'",[sources[2]])).rows[0].n,1);
});
test('scheduler deduplicates due work, rebuilds lost transport from SQL, recovers leases, and stops bounded disabled work',async()=>{
  const {sourceRegistry,scheduleDueSources}=await import('../dist/contentIntelligence/sourceRegistry.js');
  const {contentOperations}=await import('../dist/runtime/contentOperations.js');
  const {InterviewRuntime}=await import('../dist/runtime/worker.js');
  const input={sourceType:'official_api',name:'Scheduler recovery fixture',baseUrl:'https://scheduler.example.invalid/api',termsUrl:'https://scheduler.example.invalid/terms',
    permissionBasis:'fictional deterministic scheduler fixture',permissionEvidence:'no external source contact',attribution:'test fixture',
    allowedHosts:['scheduler.example.invalid'],allowedPaths:['/api'],intervalMinutes:60,rawRetentionDays:7,fullTextStorage:true,
    derivedDataStorage:true,modelProcessingAllowed:false};
  const created=await sourceRegistry.create(first,input),source=await sourceRegistry.get(first,created.id);
  await sourceRegistry.reviewPermission(first,created.id,source.permission_evidence_hash);await sourceRegistry.setEnabled(first,created.id,true);
  await query('UPDATE sources SET next_due_at=now()-interval \'1 minute\' WHERE id=$1',[created.id]);
  await scheduleDueSources();await scheduleDueSources();
  const active=(await query("SELECT o.id,o.status FROM durable_operations o WHERE o.source_id=$1 AND o.operation_type='source_collection' AND o.status IN ('queued','running','retryable_failed')",[created.id])).rows;
  assert.equal(active.length,1);assert.equal(active[0].status,'queued');
  const manual=await sourceRegistry.collect(first,created.id,'manual');assert.equal(manual.operationId,active[0].id);
  const redis=(await import('../dist/config/redisConfig.js')).default;await redis.ping();await redis.flushdb();
  const published=[];const runtime=new InterviewRuntime({publish:async id=>{published.push(id);},contentHandlers:{source_collection:async()=>({fixture:true})}});
  try{
    await runtime.tick();assert.ok(published.includes(active[0].id));
    const opRun=(await query('SELECT id FROM source_collection_runs WHERE operation_id=$1',[active[0].id])).rows[0];assert.ok(opRun);
    await query(`UPDATE durable_operations SET status='running',attempts=1,total_attempts=1,max_attempts=2,lease_owner='00000000-0000-4000-8000-000000000001',lease_token='00000000-0000-4000-8000-000000000002',lease_expires_at=now()-interval '1 second'
      WHERE id=$1`,[active[0].id]);
    await query("UPDATE source_collection_runs SET status='running',started_at=now() WHERE id=$1",[opRun.id]);
    await runtime.tick();
    let recovered=(await query('SELECT status,attempts,error_code FROM durable_operations WHERE id=$1',[active[0].id])).rows[0];
    assert.equal(recovered.status,'retryable_failed');assert.equal(recovered.attempts,1);assert.equal(recovered.error_code,'content_worker_recovered');
    await query('UPDATE durable_operations SET next_retry_at=now() WHERE id=$1',[active[0].id]);
    await runtime.tick();assert.ok(published.filter(id=>id===active[0].id).length>=2);
    await query(`UPDATE durable_operations SET status='running',attempts=2,total_attempts=2,lease_owner='00000000-0000-4000-8000-000000000003',lease_token='00000000-0000-4000-8000-000000000004',lease_expires_at=now()-interval '1 second' WHERE id=$1`,[active[0].id]);
    await runtime.tick();
    recovered=(await query('SELECT status,attempts,error_code,next_retry_at FROM durable_operations WHERE id=$1',[active[0].id])).rows[0];
    assert.equal(recovered.status,'terminal_failed');assert.equal(recovered.attempts,2);assert.equal(recovered.error_code,'content_operation_expired');assert.equal(recovered.next_retry_at,null);
    const raced=await contentOperations.enqueue({type:'source_extraction',scopeType:'source',scopeId:created.id,sourceId:created.id,
      idempotencyKey:'two-workers-one-source-operation',payload:{recordId:randomUUID(),inputHash:'a'.repeat(64)},requestedBy:first,maxAttempts:2});
    let raceCalls=0,releaseRace;
    const handler={source_extraction:async()=>{raceCalls++;await new Promise(resolve=>{releaseRace=resolve;});return {fixtureCommitted:true};}};
    const workerA=new InterviewRuntime({contentHandlers:handler}),workerB=new InterviewRuntime({contentHandlers:handler});
    try{
      const firstWorker=workerA.process(raced.id);await until(()=>releaseRace,'first worker lease claim');
      await workerB.process(raced.id);assert.equal(raceCalls,1);releaseRace();await firstWorker;
      assert.equal((await query('SELECT status FROM durable_operations WHERE id=$1',[raced.id])).rows[0].status,'succeeded');
    }finally{await workerA.stop(true);await workerB.stop(true);}
    await sourceRegistry.setEnabled(first,created.id,true);
    const running=await contentOperations.enqueue({type:'source_collection',scopeType:'source',scopeId:created.id,sourceId:created.id,
      idempotencyKey:'disabled-while-running',payload:{runId:randomUUID()},requestedBy:first,maxAttempts:2});
    let releaseRunning;const disabledRuntime=new InterviewRuntime({contentHandlers:{source_collection:async()=>{await new Promise(resolve=>{releaseRunning=resolve;});return {fixtureCommitted:true};}}});
    try{
      const processing=disabledRuntime.process(running.id);await until(()=>releaseRunning,'running collection lease claim');
      await sourceRegistry.setEnabled(first,created.id,false);releaseRunning();await processing;
      const rejected=(await query('SELECT status,error_code FROM durable_operations WHERE id=$1',[running.id])).rows[0];
      assert.equal(rejected.status,'terminal_failed');assert.equal(rejected.error_code,'source_permission_required');
    }finally{await disabledRuntime.stop(true);}
    await sourceRegistry.setEnabled(first,created.id,true);
    const next=await contentOperations.enqueue({type:'source_collection',scopeType:'source',scopeId:created.id,sourceId:created.id,
      idempotencyKey:'disabled-while-queued',payload:{runId:randomUUID()},requestedBy:first,maxAttempts:2});
    await sourceRegistry.setEnabled(first,created.id,false);
    await runtime.process(next.id);
    const disabled=(await query('SELECT status,error_code FROM durable_operations WHERE id=$1',[next.id])).rows[0];
    assert.equal(disabled.status,'terminal_failed');assert.equal(disabled.error_code,'source_permission_required');
    const runs=(await query("SELECT status FROM source_collection_runs WHERE operation_id=$1",[next.id])).rows[0];
    assert.ok(!runs||runs.status!=='succeeded');
  }finally{await runtime.stop(true);}
});
test('REST page cursor survives restart after a safe page and retries failed pages idempotently with ETag state',async()=>{
  const {startInterviewRuntime}=await import('../dist/runtime/worker.js');
  let phase='first',requests=[];
  const server=createServer((req,res)=>{
    requests.push({path:req.url,etag:req.headers['if-none-match']||null});res.setHeader('content-type','application/json');
    if(req.url==='/feed'){
      if(req.headers['if-none-match']==='"cursor-page-one"'&&phase==='unchanged'){res.statusCode=304;res.end();return;}
      res.setHeader('etag','"cursor-page-one"');res.end(JSON.stringify({items:[{id:'cursor-one',title:'Page one',text:'First page interview report',url:'https://cursor.example.invalid/article/one',topics:['cursor-fixture']}],next:'/page2'}));return;
    }
    if(phase==='first'){res.statusCode=503;res.end('fixture transient outage');return;}
    if(phase==='second'){res.setHeader('etag','"cursor-page-two"');res.end(JSON.stringify({items:[{id:'cursor-two',title:'Page two',text:'Second page interview report',url:'https://cursor.example.invalid/article/two',topics:['cursor-fixture']}]}));return;}
    if(phase==='unchanged'){res.statusCode=304;res.end();return;}
    res.setHeader('etag','"cursor-page-two-v2"');res.end(JSON.stringify({items:[{id:'cursor-two',title:'Page two changed',text:'Updated second page report',url:'https://cursor.example.invalid/article/two',topics:['cursor-fixture']}]}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;
  const {sourceRegistry:registry}=await import('../dist/contentIntelligence/sourceRegistry.js');
  const input={sourceType:'official_api',name:'Paginated cursor fixture',baseUrl:'https://cursor.example.invalid/feed',termsUrl:'https://cursor.example.invalid/terms',
    permissionBasis:'fictional pagination fixture',permissionEvidence:'test-only content with no external contact',attribution:'fixture',
    allowedHosts:['cursor.example.invalid','127.0.0.1'],allowedPaths:['/feed','/page2','/article/one','/article/two'],intervalMinutes:60,rawRetentionDays:7,
    fullTextStorage:true,derivedDataStorage:true,modelProcessingAllowed:false};
  const created=await registry.create(first,input),source=await registry.get(first,created.id);
  await registry.reviewPermission(first,created.id,source.permission_evidence_hash);await registry.setEnabled(first,created.id,true);
  await query('UPDATE sources SET origin=$2,next_due_at=now()+interval \'1 hour\' WHERE id=$1',[created.id,`http://127.0.0.1:${port}/feed`]);
  let runtime;
  try{
    const queued=await registry.collect(first,created.id,'manual');runtime=await startInterviewRuntime();
    await until(async()=>{
      const row=(await query('SELECT status FROM durable_operations WHERE id=$1',[queued.operationId])).rows[0];return row?.status==='retryable_failed';
    },'failed second page');
    let saved=(await query('SELECT collection_cursor FROM sources WHERE id=$1',[created.id])).rows[0].collection_cursor;
    assert.equal(saved.pageUrl,`http://127.0.0.1:${port}/page2`);assert.equal(saved['etag:'+createHash('sha256').update(`http://127.0.0.1:${port}/feed`).digest('hex')],'"cursor-page-one"');
    assert.equal((await query('SELECT count(*)::int AS n FROM ingestion_records WHERE source_id=$1',[created.id])).rows[0].n,1);
    phase='second';await query('UPDATE durable_operations SET next_retry_at=now() WHERE id=$1',[queued.operationId]);
    await until(async()=>{
      const row=(await query('SELECT status FROM durable_operations WHERE id=$1',[queued.operationId])).rows[0];return row?.status==='succeeded';
    },'page restart and completion');
    assert.deepEqual(requests.map(r=>r.path),['/feed','/page2','/page2']);
    assert.equal((await query('SELECT count(*)::int AS n FROM ingestion_records WHERE source_id=$1',[created.id])).rows[0].n,2);
    saved=(await query('SELECT collection_cursor FROM sources WHERE id=$1',[created.id])).rows[0].collection_cursor;
    assert.equal(saved.pageUrl,undefined);assert.equal(saved.etag,'"cursor-page-two"');
    phase='unchanged';
    const unchanged=await registry.collect(first,created.id,'retry');await query('UPDATE durable_operations SET next_retry_at=now() WHERE id=$1',[unchanged.operationId]);
    await until(async()=>{
      const row=(await query('SELECT status,result FROM durable_operations WHERE id=$1',[unchanged.operationId])).rows[0];return row?.status==='succeeded'?row:null;
    },'304 retry');
    assert.equal((await query('SELECT count(*)::int AS n FROM ingestion_records WHERE source_id=$1',[created.id])).rows[0].n,2);
    phase='changed';const changed=await registry.collect(first,created.id,'retry');await query('UPDATE durable_operations SET next_retry_at=now() WHERE id=$1',[changed.operationId]);
    await until(async()=>{
      const row=(await query('SELECT status FROM durable_operations WHERE id=$1',[changed.operationId])).rows[0];return row?.status==='succeeded';
    },'changed item version');
    const versions=(await query(`SELECT d.external_key,v.version,v.title FROM source_documents d JOIN source_document_versions v ON v.document_id=d.id
      WHERE d.source_id=$1 ORDER BY d.external_key,v.version`,[created.id])).rows;
    assert.equal(versions.filter(v=>v.external_key==='cursor-two').length,2);
    assert.equal(versions.find(v=>v.external_key==='cursor-two'&&Number(v.version)===2).title,'Page two changed');
    assert.ok(requests.some(r=>r.path==='/feed'&&r.etag==='"cursor-page-one"'));
  }finally{
    if(runtime)await runtime.stop(true);server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  }
});
test('permitted REST collection commits quarantine first and dispatches consented extraction durably without auto-approval',async()=>{
  const {sourceRegistry}=await import('../dist/contentIntelligence/sourceRegistry.js');
  const {aiService}=await import('../dist/services/aiService.js');
  const question='Explain how a SQL index changes query lookup cost.';
  const server=createServer((_req,res)=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({items:[{
    id:'fixture-item-1',title:'Fictional database interview report',text:question,url:`https://127.0.0.1/article/1`,role:'Backend Developer',
    company:null,roundType:'technical',topics:['SQL'],publishedAt:'2026-10-01T00:00:00Z',
  }]}));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port,base=`https://127.0.0.1/api/items`;
  const input={sourceType:'official_api',name:'Disposable API fixture',baseUrl:base,termsUrl:'https://127.0.0.1/terms',
    permissionBasis:'written disposable fixture grant',permissionEvidence:'fictional test-only source, no external network access',attribution:'Aptlyra fixture',
    allowedHosts:['127.0.0.1'],allowedPaths:['/api/items','/article/1'],intervalMinutes:60,rawRetentionDays:7,
    fullTextStorage:true,derivedDataStorage:true,modelProcessingAllowed:true};
  const original=aiService.extractInterviewExperience;
  let runtime;
  try{
    const created=await sourceRegistry.create(first,input),source=await sourceRegistry.get(first,created.id);
    await sourceRegistry.reviewPermission(first,created.id,source.permission_evidence_hash);
    await sourceRegistry.setEnabled(first,created.id,true);
    await query("UPDATE sources SET origin=$2 WHERE id=$1",[created.id,`http://127.0.0.1:${port}/api/items`]);
    aiService.extractInterviewExperience=async({sourceText})=>{
      const start=Array.from(sourceText).join('').indexOf(question);
      return {contractVersion:'interview-extraction-v1',candidates:[{question,role:'Backend Developer',company:null,occurredOn:null,
        datePrecision:'unknown',roundType:'technical',taxonomy:'dbms-sql.transactions-indexes',category:'conceptual-oral',difficulty:'standard',
        language:'en',topics:['SQL'],derivationType:'direct',evidenceStart:start,evidenceEnd:start+question.length,evidenceText:question,confidence:.9}]};
    };
    const queued=await sourceRegistry.collect(first,created.id,'manual');
    const {startInterviewRuntime}=await import('../dist/runtime/worker.js');runtime=await startInterviewRuntime();
    let run;
    for(let i=0;i<250;i++){
      run=(await query('SELECT * FROM source_collection_runs WHERE operation_id=$1',[queued.operationId])).rows[0];
      if(run?.status==='succeeded')break;
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    assert.equal(run?.status,'succeeded');assert.equal(run.discovered_count,1);assert.equal(run.imported_count,1);
    const imported=(await query(`SELECT r.id,r.input_hash,r.state,v.status,e.ai_processing_consent,e.company_label
      FROM ingestion_records r JOIN source_document_versions v ON v.id=r.document_version_id
      JOIN interview_experience_records e ON e.document_version_id=v.id WHERE r.source_id=$1`,[created.id])).rows[0];
    assert.ok(imported);assert.equal(imported.state,'review_required');assert.equal(imported.status,'quarantined');
    assert.equal(imported.ai_processing_consent,true);assert.equal(imported.company_label,null);
    let extraction;
    for(let i=0;i<250;i++){
      extraction=(await query("SELECT * FROM durable_operations WHERE source_id=$1 AND operation_type='source_extraction' ORDER BY created_at DESC LIMIT 1",[created.id])).rows[0];
      if(extraction?.status==='succeeded'||extraction?.status==='terminal_failed')break;
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    assert.equal(extraction?.status,'succeeded');
    assert.equal((await query('SELECT state FROM ingestion_candidates WHERE record_id=$1',[imported.id])).rows[0].state,'review_required');
    assert.equal((await query("SELECT count(*)::int AS n FROM ingestion_review_events WHERE record_id=$1 AND action='approved'",[imported.id])).rows[0].n,0);
    assert.equal((await query("SELECT event_metadata->>'invocation' AS invocation FROM ingestion_review_events WHERE record_id=$1 AND action='extracted'",[imported.id])).rows[0].invocation,'permission-authorized-worker');
    const {contentEditorial}=await import('../dist/contentIntelligence/editorial.js');
    await contentEditorial.approveSourceRecord(first,imported.id,imported.input_hash);
    await contentEditorial.publishSourceRecord(first,imported.id);
    const {contentTrends}=await import('../dist/contentIntelligence/trends.js');
    const signals=await contentTrends.list(first,90,'Backend Developer'),signal=signals.find(item=>item.topic==='SQL');
    assert.ok(signal);assert.equal(signal.distinctRecords,1);
    assert.equal(signal.independentSources,1);assert.equal(signal.company,null);
    assert.equal(signal.metadataConfidence,'report-date-lower-confidence');
    await assert.rejects(()=>contentTrends.list(first,60),/invalid_trend_filters/);
    await sourceRegistry.withdraw(first,created.id,'fictional fixture permission withdrawn');
    assert.equal((await contentTrends.list(first,90,'Backend Developer')).some(item=>item.topic==='SQL'),false);
  }finally{
    aiService.extractInterviewExperience=original;
    if(runtime)await runtime.stop(true);
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  }
});
test('only linked enabled human accounts can read the review queue; test consent/privacy gates fail closed',async()=>{
  await assert.rejects(()=>service.reviewQueue(second),/reviewer-not-authorized/);
  assert.ok((await service.reviewQueue(first)).some(item=>item.id===record.id));
  await assert.rejects(()=>service.create(first,{role:'Backend Developer',topics:['SQL'],questions:['Contact private@example.com'],practiceConsent:true,rightToShare:true}),/unsafe-submission/);
  await assert.rejects(()=>service.create(first,{role:'Backend Developer',topics:['SQL'],questions:['Question'],practiceConsent:false,rightToShare:true}),/consent-required/);
  await assert.rejects(()=>service.withdrawMine(second,record.id),/submission-not-found/);
});
test('AI extraction requires explicit consent and creates only unapproved exact-evidence proposals',async()=>{
  const {contentEditorial}=await import('../dist/contentIntelligence/editorial.js');
  const {aiService}=await import('../dist/services/aiService.js');
  const noConsent=(await query('SELECT content_hash FROM source_document_versions WHERE id=(SELECT document_version_id FROM ingestion_records WHERE id=$1)',[record.id])).rows[0];
  await assert.rejects(()=>contentEditorial.extractSubmission(first,record.id,noConsent.content_hash),/ai-processing-consent-required/);
  const allowed=await service.create(first,{role:'Backend Developer',topics:['SQL'],questions:['What does an index do?'],practiceConsent:true,rightToShare:true,aiProcessingConsent:true});
  const source=(await query('SELECT r.source_id,r.document_version_id,r.input_hash,v.normalized_text FROM ingestion_records r JOIN source_document_versions v ON v.id=r.document_version_id WHERE r.id=$1',[allowed.id])).rows[0];
  const taxonomy=(await query("SELECT id FROM competencies WHERE taxonomy_version='junior-se-v1' AND kind='child' AND status='active' LIMIT 1")).rows[0].id;
  const evidence='What does an index do?',start=Array.from(source.normalized_text).join('').indexOf(evidence);
  const original=aiService.extractInterviewExperience;
  aiService.extractInterviewExperience=async()=>({contractVersion:'interview-extraction-v1',candidates:[{
    question:'What does an index do?',role:'Backend Developer',company:null,occurredOn:null,datePrecision:'unknown',roundType:null,
    taxonomy,category:'sql',difficulty:'standard',language:'en',topics:['SQL'],derivationType:'direct',evidenceStart:start,
    evidenceEnd:start+evidence.length,evidenceText:evidence,confidence:0.9,
  }]});
  try{
    await assert.rejects(()=>contentEditorial.extractSubmission(first,allowed.id,'0'.repeat(64)),/review-hash-mismatch/);
    const outcome=await contentEditorial.extractSubmission(first,allowed.id,source.input_hash);
    assert.equal(outcome.aiApproved,false);assert.equal(outcome.candidateIds.length,1);
    const candidate=(await query('SELECT state,extraction_method,extraction_contract,confidence,extraction_metadata FROM ingestion_candidates WHERE id=$1',[outcome.candidateIds[0]])).rows[0];
    assert.equal(candidate.state,'review_required');assert.equal(candidate.extraction_method,'model-proposal-v1');assert.equal(candidate.extraction_contract,'interview-extraction-v1');
    assert.equal(Number(candidate.confidence),0.9);assert.equal(candidate.extraction_metadata.language,'en');
    assert.equal((await query("SELECT event_metadata->>'aiApproved' AS ai_approved FROM ingestion_review_events WHERE record_id=$1 AND action='extracted'",[allowed.id])).rows[0].ai_approved,'false');
    await assert.rejects(()=>contentEditorial.approveQuestion(first,outcome.candidateIds[0],'0'.repeat(64)),/review-hash-mismatch/);
    const candidateHash=(await query('SELECT content_hash FROM ingestion_candidates WHERE id=$1',[outcome.candidateIds[0]])).rows[0].content_hash;
    await contentEditorial.approveQuestion(first,outcome.candidateIds[0],candidateHash);
    assert.equal((await query('SELECT state FROM ingestion_candidates WHERE id=$1',[outcome.candidateIds[0]])).rows[0].state,'approved');
    assert.equal((await query('SELECT state,review_status,permission_basis FROM sources WHERE id=$1',[source.source_id])).rows[0].permission_basis,'submitter-consent-v1');
    const secondCandidate=randomUUID(),duplicateHash=createHash('sha256').update('fixture duplicate proposal').digest('hex');
    const chunk=(await query('SELECT id FROM source_chunks WHERE document_version_id=$1',[source.document_version_id])).rows[0].id;
    await query(`INSERT INTO ingestion_candidates(id,record_id,chunk_id,specification,content_hash,evidence_start,evidence_end)
      VALUES($1,$2,$3,$4,$5,0,1)`,[secondCandidate,allowed.id,chunk,JSON.stringify({text:'What is a SQL index used for?',category:'sql',difficulty:'standard',primary:taxonomy,secondary:[],roles:['Backend Developer']}),duplicateHash]);
    await contentEditorial.duplicateQuestion(first,secondCandidate,duplicateHash,outcome.candidateIds[0],'duplicate-family');
    assert.equal((await query('SELECT state,duplicate_of FROM ingestion_candidates WHERE id=$1',[secondCandidate])).rows[0].state,'duplicate');
    const auditId=(await query("SELECT id FROM ingestion_review_events WHERE candidate_id=$1 AND action='duplicate'",[secondCandidate])).rows[0].id;
    await assert.rejects(()=>query("UPDATE ingestion_review_events SET reason_code='rewritten' WHERE id=$1",[auditId]),e=>e.code==='23514');
    const editable=randomUUID(),oldText='Why do database systems use indexes?',oldHash=createHash('sha256').update(oldText).digest('hex');
    await query(`INSERT INTO ingestion_candidates(id,record_id,chunk_id,specification,content_hash,evidence_start,evidence_end)
      VALUES($1,$2,$3,$4,$5,0,1)`,[editable,allowed.id,chunk,JSON.stringify({text:oldText,category:'sql',difficulty:'standard',primary:taxonomy,secondary:[],roles:['Backend Developer']}),oldHash]);
    await contentEditorial.editApproveQuestion(first,editable,oldHash,{text:'How does an index help SQL?',category:'sql',difficulty:'standard',primary:taxonomy,secondary:[],roles:['Backend Developer']},'paraphrased');
    const edited=(await query('SELECT state,content_hash FROM ingestion_candidates WHERE id=$1',[editable])).rows[0];
    assert.equal(edited.state,'approved');assert.notEqual(edited.content_hash,oldHash);
    const editEvent=(await query("SELECT event_metadata->>'previousHash' AS previous_hash FROM ingestion_review_events WHERE candidate_id=$1 AND action='edited-approved'",[editable])).rows[0];
    assert.equal(editEvent.previous_hash,oldHash);
  }finally{aiService.extractInterviewExperience=original;}
});
test('owner withdrawal redacts quarantine text and leaves immutable audit history',async()=>{
  await service.withdrawMine(first,record.id);
  const row=(await query(`SELECT r.state,v.status,v.normalized_text,v.redacted_at,c.excerpt,c.status AS chunk_state,
    e.notes,e.topics,e.consent_evidence FROM ingestion_records r JOIN source_document_versions v ON v.id=r.document_version_id
    JOIN source_chunks c ON c.document_version_id=v.id JOIN interview_experience_records e ON e.document_version_id=v.id WHERE r.id=$1`,[record.id])).rows[0];
  assert.equal(row.state,'withdrawn');assert.equal(row.status,'withdrawn');assert.equal(row.normalized_text,null);assert.ok(row.redacted_at);
  assert.equal(row.excerpt,null);assert.equal(row.chunk_state,'retired');assert.deepEqual(row.topics,[]);assert.equal(row.consent_evidence,'withdrawn');
  assert.deepEqual((await query('SELECT action FROM ingestion_review_events WHERE record_id=$1 ORDER BY created_at',[record.id])).rows.map(r=>r.action),['received','withdrawn']);
  await assert.rejects(()=>query('UPDATE ingestion_review_events SET reason_code=\'changed\' WHERE record_id=$1',[record.id]),e=>e.code==='23514');
});
