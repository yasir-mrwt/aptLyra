import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { createHash } from "node:crypto";

export interface CollectorSource {
  id: string; adapter: "official-api" | "rss-atom"; origin: string;
  allowedHosts: string[]; allowedPaths: string[]; allowedQueryKeys?: string[];
  maxItems?: number; maxPages?: number; rateLimitMs?: number;
}
export interface CollectedItem { externalId: string; title: string; text: string; url: string; publishedAt?: string; hash: string; role?:string; company?:string; occurredOn?:string; roundType?:string; topics?:string[]; }
export interface CollectorResult { items: CollectedItem[]; cursor: Record<string,string>; notModified: boolean; }
export class CollectorError extends Error {
  constructor(public category: "rate_limited"|"network_failure"|"invalid_payload"|"authentication_required"|"source_format_changed", public retryAfterMs?: number) { super(category); }
}
const sha=(v:string)=>createHash("sha256").update(v).digest("hex");
const privateV4=(ip:string)=>{const p=ip.split(".").map(Number);return p.length!==4||p.some(n=>!Number.isInteger(n)||n<0||n>255)||p[0]===0||p[0]===10||p[0]===127||p[0]>=224||(p[0]===169&&p[1]===254)||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===192&&p[1]===168)||(p[0]===100&&p[1]>=64&&p[1]<=127)||(p[0]===192&&p[1]===0)||(p[0]===198&&(p[1]===18||p[1]===19));};
const privateIp=(ip:string)=>{if(isIP(ip)===4)return privateV4(ip);if(isIP(ip)===6){const x=ip.toLowerCase();return x==="::"||x==="::1"||x.startsWith("fc")||x.startsWith("fd")||/^fe[89ab]/.test(x)||x.startsWith("::ffff:");}return true;};
const localFixture=(url:URL)=>process.env.NODE_ENV==="test"&&["127.0.0.1","localhost","::1"].includes(url.hostname);
function validateUrl(raw:string,source:CollectorSource):URL {
  let u:URL;try{u=new URL(raw);}catch{throw new CollectorError("invalid_payload");}
  const host=u.hostname.toLowerCase().replace(/\.$/,"");
  if(u.username||u.password||u.hash||!(u.protocol==="https:"||(u.protocol==="http:"&&localFixture(u)))||
    !source.allowedHosts.map(h=>h.toLowerCase()).includes(host)||!source.allowedPaths.includes(u.pathname)||
    [...u.searchParams.keys()].some(k=>!(source.allowedQueryKeys||[]).includes(k)))throw new CollectorError("invalid_payload");
  return u;
}
async function requestOne(u:URL,headers:Record<string,string>,maxBytes:number,timeoutMs:number):Promise<{status:number;headers:Record<string,string|string[]|undefined>;body:string}> {
  if(!localFixture(u)){
    const addresses=await lookup(u.hostname,{all:true,verbatim:true}).catch(()=>[]);
    if(!addresses.length||addresses.some(a=>privateIp(a.address)))throw new CollectorError("invalid_payload");
  }
  return new Promise((resolve,reject)=>{
    const request=(u.protocol==="https:"?httpsRequest:httpRequest)(u,{method:"GET",headers,timeout:timeoutMs,lookup:(hostname,options,cb)=>{
      if(localFixture(u)){cb(null,u.hostname==="localhost"?"127.0.0.1":u.hostname,4);return;}
      lookup(hostname,{all:true,verbatim:true}).then(rows=>{
        if(!rows.length||rows.some(a=>privateIp(a.address)))return cb(Object.assign(new Error("network_failure"),{code:"EACCES"}),"",0);
        const chosen=rows[0];cb(null,chosen.address,chosen.family);
      }).catch(()=>cb(Object.assign(new Error("network_failure"),{code:"EHOSTUNREACH"}),"",0));
    }},res=>{
      const chunks:Buffer[]=[];let size=0;res.on("data",(chunk:Buffer)=>{size+=chunk.length;if(size>maxBytes){request.destroy(new Error("payload_too_large"));return;}chunks.push(chunk);});
      res.on("end",()=>resolve({status:res.statusCode||0,headers:res.headers,body:Buffer.concat(chunks).toString("utf8")}));
    });
    request.on("timeout",()=>request.destroy(new Error("timeout")));
    request.on("error",error=>reject(error.message==="payload_too_large"?new CollectorError("invalid_payload"):new CollectorError("network_failure")));
    request.end();
  });
}
async function fetchSafe(raw:string,source:CollectorSource,cursor:Record<string,string>) {
  let current=validateUrl(raw,source);const headers:Record<string,string>={"User-Agent":"Aptlyra-Interview-Intelligence/1.0 (permission-based collector)",Accept:source.adapter==="rss-atom"?"application/rss+xml, application/atom+xml, application/xml, text/xml":"application/json"};
  if(cursor.etag)headers["If-None-Match"]=cursor.etag;if(cursor.lastModified)headers["If-Modified-Since"]=cursor.lastModified;
  for(let redirects=0;redirects<=3;redirects++){
    const r=await requestOne(current,headers,1_000_000,8_000);
    if([301,302,303,307,308].includes(r.status)){const loc=r.headers.location;if(typeof loc!=="string"||redirects===3)throw new CollectorError("invalid_payload");current=validateUrl(new URL(loc,current).toString(),source);continue;}
    if(r.status===304)return {r,current,notModified:true};
    if(r.status===429){const header=String(r.headers["retry-after"]||""),seconds=Number(header),date=Date.parse(header),delay=Number.isFinite(seconds)&&header.trim()!==""?seconds*1000:Number.isFinite(date)?Math.max(0,date-Date.now()):60000;throw new CollectorError("rate_limited",Math.min(delay,3600000));}
    if(r.status===401||r.status===403)throw new CollectorError("authentication_required");
    if(r.status>=500)throw new CollectorError("network_failure",2000);
    if(r.status<200||r.status>=300)throw new CollectorError("invalid_payload");
    const ct=String(r.headers["content-type"]||"").toLowerCase();
    if(source.adapter==="official-api"?!/application\/(?:[\w.+-]*\+)?json\b/.test(ct):!/(?:application\/(?:rss\+xml|atom\+xml|xml)|text\/xml)/.test(ct))throw new CollectorError("invalid_payload");
    return {r,current,notModified:false};
  }
  throw new CollectorError("invalid_payload");
}
const decoded=(v:string)=>v.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").replace(/<[^>]*>/g," ").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g," ").trim();
function parseFeed(xml:string,source:CollectorSource):CollectedItem[]{
  if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new CollectorError("invalid_payload");
  const blocks=xml.match(/<(item|entry)\b[^>]*>[\s\S]*?<\/\1\s*>/gi)||[];
  return blocks.slice(0,source.maxItems||100).flatMap((b):CollectedItem[]=>{
    const tag=(names:string[])=>{for(const name of names){const re=new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}\\s*>`,`i`);const m=b.match(re);if(m)return decoded(m[1]);}return "";};
    const id=tag(["guid","id"]),atomLink=b.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\/?\s*>/i)?.[1]||"",link=tag(["link"])||decoded(atomLink),title=tag(["title"]),text=tag(["description","summary","content"]);if(!id||!title||!text)return [];
    const url=link?new URL(link,source.origin).toString():source.origin;validateUrl(url,{...source,allowedPaths:[...source.allowedPaths,new URL(url).pathname]});const date=tag(["pubDate","published","updated"]),publishedAt=Number.isFinite(Date.parse(date))?new Date(date).toISOString():undefined;
    const role=tag(["role"]),company=tag(["company"]),roundType=tag(["round"]),topics=tag(["category"]).split(",").map(x=>x.trim()).filter(Boolean).slice(0,20);
    return [{externalId:id.slice(0,500),title:title.slice(0,500),text:text.slice(0,16000),url,publishedAt,hash:sha(`${title}\n${text}`),
      ...(role?{role}:{}),...(company?{company}:{}),...(roundType?{roundType}:{}),...(topics.length?{topics}:{})}];
  });
}
export async function collectSource(source:CollectorSource,cursor:Record<string,string>={},onPage?:(items:CollectedItem[],cursor:Record<string,string>,page:number)=>Promise<void>):Promise<CollectorResult>{
  if(!source.id||!source.allowedHosts.length||!source.allowedPaths.length)throw new CollectorError("invalid_payload");
  const origin=validateUrl(source.origin,source);let url=cursor.pageUrl?validateUrl(cursor.pageUrl,source).toString():origin.toString();
  const items:CollectedItem[]=[];let nextCursor={...cursor};delete nextCursor.pageUrl;
  for(let page=0;page<Math.min(source.maxPages||1,5);page++){
    const legacyOriginValidators=!cursor.pageUrl&&!nextCursor.validatorUrl,validatorKey=sha(url),
      etag=nextCursor[`etag:${validatorKey}`]||(nextCursor.validatorUrl===url||legacyOriginValidators?nextCursor.etag:undefined),
      lastModified=nextCursor[`lastModified:${validatorKey}`]||(nextCursor.validatorUrl===url||legacyOriginValidators?nextCursor.lastModified:undefined);
    const requestCursor:Record<string,string>={...(etag?{etag}:{}),...(lastModified?{lastModified}:{})};
    const {r,notModified}=await fetchSafe(url,source,requestCursor);if(notModified)return {items,cursor:{...cursor},notModified:true};
    let pageItems:CollectedItem[]=[],nextUrl:string|null=null;
    if(source.adapter==="rss-atom"){pageItems=parseFeed(r.body,source);}
    else {
      let data:any;try{data=JSON.parse(r.body);}catch{throw new CollectorError("invalid_payload");}
      const list=Array.isArray(data)?data:data?.items;if(!Array.isArray(list)||list.length>(source.maxItems||100))throw new CollectorError("invalid_payload");
      for(const x of list){if(items.length+pageItems.length>=(source.maxItems||100))break;if(!x||typeof x!=="object"||typeof x.id!=="string"||typeof x.title!=="string"||typeof (x.text??x.description)!=="string"||typeof x.url!=="string")throw new CollectorError("invalid_payload");
        const itemUrl=validateUrl(x.url,source).toString(),text=String(x.text??x.description).slice(0,16000),publishedAt=x.publishedAt&&Number.isFinite(Date.parse(x.publishedAt))?new Date(x.publishedAt).toISOString():undefined;
        const role=typeof x.role==="string"?x.role:undefined,company=typeof x.company==="string"?x.company:undefined;
        const occurredOn=typeof x.occurredOn==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x.occurredOn)&&Number.isFinite(Date.parse(x.occurredOn))?x.occurredOn:undefined;
        const roundType=typeof x.roundType==="string"?x.roundType:undefined,topics=Array.isArray(x.topics)?x.topics.filter((t:any)=>typeof t==="string").slice(0,20):undefined;
        pageItems.push({externalId:x.id.slice(0,500),title:x.title.slice(0,500),text,url:itemUrl,publishedAt,hash:sha(`${x.title}\n${text}`),...(role?{role}:{}),...(company?{company}:{}),...(occurredOn?{occurredOn}:{}),...(roundType?{roundType}:{}),...(topics?.length?{topics}:{})});}
      const next=data.next;if(typeof next==="string"&&page+1<(source.maxPages||1)&&items.length+pageItems.length<(source.maxItems||100))nextUrl=validateUrl(new URL(next,url).toString(),source).toString();
    }
    const validators:Record<string,string>={...nextCursor,validatorUrl:url};delete validators.etag;delete validators.lastModified;
    if(r.headers.etag){validators.etag=String(r.headers.etag);validators[`etag:${validatorKey}`]=String(r.headers.etag);}
    if(r.headers["last-modified"]){validators.lastModified=String(r.headers["last-modified"]);validators[`lastModified:${validatorKey}`]=String(r.headers["last-modified"]);}
    nextCursor={...nextCursor,...validators};
    if(nextUrl)nextCursor.pageUrl=nextUrl;else delete nextCursor.pageUrl;
    await onPage?.(pageItems,nextCursor,page);
    items.push(...pageItems);if(!nextUrl)break;url=nextUrl;
  }
  return {items:items.slice(0,source.maxItems||100),cursor:nextCursor,notModified:false};
}
