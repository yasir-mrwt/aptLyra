import {randomUUID, createHash} from "node:crypto";
import {mkdir, readFile, rename, open, unlink, readdir, stat} from "node:fs/promises";
import {resolve, join, extname} from "node:path";
import {RuntimeFailure} from "./contracts.js";
export const mediaDirectory = () => resolve(process.env.INTERVIEW_MEDIA_DIR || "uploads/interviews");
export async function stageAudio(inputPath: string) {
  const extension = extname(inputPath).toLowerCase();
  if(![".webm",".wav",".mp3",".ogg",".m4a"].includes(extension))throw new RuntimeFailure("unsupported_audio");
  const size=(await stat(inputPath)).size;
  if(size<1 || size>10*1024*1024)throw new RuntimeFailure("invalid_audio_size");
  const bytes=await readFile(inputPath);const id=randomUUID(),filename=id+extension;
  await mkdir(mediaDirectory(),{recursive:true,mode:0o700});
  const temp=join(mediaDirectory(),filename+".pending");
  const file=await open(temp,"wx",0o600);
  try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}
  await rename(temp,join(mediaDirectory(),filename));
  return {id,filename,size:bytes.length,hash:createHash("sha256").update(bytes).digest("hex")};
}
function mediaPath(filename: string) {
  if(!/^[0-9a-f-]{36}\.(webm|wav|mp3|ogg|m4a)$/.test(filename))throw new RuntimeFailure("media_unavailable");
  return join(mediaDirectory(),filename);
}
export async function readStagedAudio(media: {filename:string;size_bytes:number;content_hash:string}) {
  try {
    const path=mediaPath(media.filename);if((await stat(path)).size!==media.size_bytes)throw new Error();
    const bytes=await readFile(path);
    if(bytes.length>10*1024*1024 || createHash("sha256").update(bytes).digest("hex")!==media.content_hash)throw new Error();
    return bytes;
  } catch {throw new RuntimeFailure("media_unavailable");}
}
export async function removeStagedAudio(filename:string) {
  await unlink(mediaPath(filename)).catch(error=>{if(error.code!=="ENOENT")throw error;});
}
/** Orphans left before SQL claim are private, bounded uploads; never traverse other uploads. */
export async function cleanOrphanMedia(referenced: Set<string>, ageMs=24*60*60*1000) {
  const files=await readdir(mediaDirectory()).catch(()=>[]);
  for(const filename of files){
    if(!/^[0-9a-f-]{36}\.(webm|wav|mp3|ogg|m4a)(\.pending)?$/.test(filename) || referenced.has(filename))continue;
    const path=join(mediaDirectory(),filename);
    const info=await stat(path).catch(()=>null);
    if(info?.isFile() && Date.now()-info.mtimeMs>ageMs)await unlink(path).catch(()=>{});
  }
}
