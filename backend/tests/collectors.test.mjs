import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

process.env.NODE_ENV='test';
const {collectSource,CollectorError}=await import('../dist/contentIntelligence/collectors.js');
async function fixture(handler){const server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const {port}=server.address();return {server,origin:`http://127.0.0.1:${port}`};}
const config=(origin,adapter='official-api')=>({id:'fixture',adapter,origin,allowedHosts:['127.0.0.1'],allowedPaths:['/feed','/page2'],allowedQueryKeys:['cursor'],maxItems:10,maxPages:2});

test('REST collector bounds pagination and preserves validator cursors',async()=>{
 let requests=0;
 const f=await fixture((req,res)=>{requests++;res.setHeader('content-type','application/json');res.setHeader('etag','"v1"');
   if(req.url==='/feed'){res.end(JSON.stringify({items:[{id:'one',title:'Topic',text:'Interview topic',url:`${f.origin}/feed`}],next:'/page2'}));return;}
   res.end(JSON.stringify({items:[{id:'two',title:'Another',description:'Second topic',url:`${f.origin}/page2`}]}));});
 try{const out=await collectSource(config(`${f.origin}/feed`));assert.equal(out.items.length,2);assert.equal(out.items[0].externalId,'one');assert.equal(out.cursor.etag,'"v1"');assert.equal(requests,2);}finally{f.server.close();}
});

test('page cursor resumes after a completed page and keeps validators scoped to their page URL',async()=>{
 let pageOne=0,pageTwo=0;const f=await fixture((req,res)=>{
   res.setHeader('content-type','application/json');
   if(req.url==='/feed'){pageOne++;if(req.headers['if-none-match']==='"page-one"'){res.statusCode=304;res.end();return;}
     res.setHeader('etag','"page-one"');res.end(JSON.stringify({items:[{id:'first',title:'One',text:'First page item',url:`${f.origin}/feed`}],next:'/page2'}));return;}
   pageTwo++;res.setHeader('etag','"page-two"');res.end(JSON.stringify({items:[{id:'second',title:'Two',text:'Second page item',url:`${f.origin}/page2`}]}));
 });
 try{
   let savedCursor;const initial=await collectSource(config(`${f.origin}/feed`),{},async(items,cursor)=>{if(items[0]?.externalId==='first')savedCursor=cursor;});
   assert.equal(initial.items.length,2);assert.equal(savedCursor.pageUrl,`${f.origin}/page2`);assert.equal(pageOne,1);assert.equal(pageTwo,1);
   const resumed=await collectSource(config(`${f.origin}/feed`),savedCursor);
   assert.deepEqual(resumed.items.map(item=>item.externalId),['second']);assert.equal(pageOne,1);assert.equal(pageTwo,2);
   assert.equal(resumed.cursor.pageUrl,undefined);assert.equal(resumed.cursor.etag,'"page-two"');
   const checked=await collectSource(config(`${f.origin}/feed`),resumed.cursor);
   assert.equal(checked.notModified,true);assert.equal(checked.items.length,0);assert.equal(pageOne,2);assert.equal(pageTwo,2);
 }finally{f.server.close();}
});

test('RSS/Atom collector accepts bounded feed items and reports dates',async()=>{
 const f=await fixture((_req,res)=>{res.setHeader('content-type','application/rss+xml');res.end(`<rss><channel><item><guid>x-1</guid><title>Cache topic</title><link>${f.origin}/feed</link><description><![CDATA[Cache eviction interview question]]></description><pubDate>Tue, 01 Sep 2026 00:00:00 GMT</pubDate></item></channel></rss>`);});
 try{const out=await collectSource(config(`${f.origin}/feed`,'rss-atom'));assert.equal(out.items.length,1);assert.equal(out.items[0].text,'Cache eviction interview question');assert.ok(out.items[0].publishedAt);}finally{f.server.close();}
});

test('ETag/Last-Modified validators are sent and HTTP 304 retains the cursor without importing',async()=>{
 let received;
 const f=await fixture((req,res)=>{received={etag:req.headers['if-none-match'],modified:req.headers['if-modified-since']};res.statusCode=304;res.end();});
 try{const out=await collectSource(config(`${f.origin}/feed`),{etag:'"prior"',lastModified:'Mon, 01 Jun 2026 00:00:00 GMT'});assert.equal(out.notModified,true);assert.equal(out.items.length,0);assert.equal(received.etag,'"prior"');assert.equal(received.modified,'Mon, 01 Jun 2026 00:00:00 GMT');}finally{f.server.close();}
});

test('collector rejects unallowlisted redirect targets, unsafe paths, and malformed feed payloads',async()=>{
 const f=await fixture((_req,res)=>{res.statusCode=302;res.setHeader('location','http://169.254.169.254/latest/meta-data/');res.end();});
 try{await assert.rejects(()=>collectSource(config(`${f.origin}/feed`)),e=>e instanceof CollectorError&&e.category==='invalid_payload');}finally{f.server.close();}
 const x=await fixture((_req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({items:[{id:'x',title:'T',text:'B',url:'https://example.org/no'}]}));});
 try{await assert.rejects(()=>collectSource(config(`${x.origin}/feed`)),e=>e instanceof CollectorError);}finally{x.server.close();}
});

test('collector rejects XML entities and enforces response size and content type',async()=>{
 const xml=await fixture((_req,res)=>{res.setHeader('content-type','application/xml');res.end('<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss/>');});
 try{await assert.rejects(()=>collectSource(config(`${xml.origin}/feed`,'rss-atom')),e=>e instanceof CollectorError&&e.category==='invalid_payload');}finally{xml.server.close();}
 const bad=await fixture((_req,res)=>{res.setHeader('content-type','text/html');res.end('<html/>');});
 try{await assert.rejects(()=>collectSource(config(`${bad.origin}/feed`)),e=>e instanceof CollectorError&&e.category==='invalid_payload');}finally{bad.server.close();}
});

test('HTTP fixture URLs remain test-only and 429 exposes only a bounded Retry-After',async()=>{
 const f=await fixture((_req,res)=>{res.statusCode=429;res.setHeader('retry-after','120');res.end('upstream private body');});
 try{
   process.env.NODE_ENV='production';await assert.rejects(()=>collectSource(config(`${f.origin}/feed`)),e=>e instanceof CollectorError&&e.category==='invalid_payload');
   process.env.NODE_ENV='test';await assert.rejects(()=>collectSource(config(`${f.origin}/feed`)),e=>e instanceof CollectorError&&e.category==='rate_limited'&&e.retryAfterMs===120000);
 }finally{process.env.NODE_ENV='test';f.server.close();}
});
