import fs from "node:fs/promises";
import FormData from "form-data";
import fetch from "node-fetch";
import {createHash} from "node:crypto";
import * as mammoth from "mammoth";
import {getCachedResult,setCachedResult} from "../cacheService.js";
import {getAIServiceUrl} from "./utils.js";

/** Keep parsing in the durable BullMQ job until the result is acknowledged.
 * A 202 callback dispatch alone is not successful processing: callbacks can be lost. */
export const stepProcess=async(resume:any):Promise<any>=>{
  const bytes=await fs.readFile(resume.filePath);
  const fingerprint=createHash("sha256").update(bytes).digest("hex");
  const cached=await getCachedResult("process",fingerprint);if(cached)return cached;
  let buffer=bytes,filename=resume.originalFilename,mime=resume.fileType==="pdf"?"application/pdf":"text/plain";
  if(resume.fileType==="docx"){
    buffer=Buffer.from((await mammoth.extractRawText({buffer:bytes})).value,"utf8");filename="resume.txt";mime="text/plain";
  }
  const form=new FormData();form.append("file",buffer,{filename,contentType:mime});
  const response=await fetch(`${getAIServiceUrl()}/resume/v2/process`,{
    method:"POST",body:form,headers:{...form.getHeaders(),"X-API-Key":process.env.INTERNAL_API_KEY||""},
    signal:AbortSignal.timeout(120000),redirect:"error",size:2*1024*1024,
  });
  if(!response.ok)throw Error(`Resume parsing unavailable (${response.status})`);
  const result=await response.json() as any;
  if(result?.is_resume===false)return result;
  if(result?.success===false||typeof result?.raw_text!=="string"||!result.raw_text.trim())throw Error("Resume parsing returned no usable text");
  await setCachedResult("process",fingerprint,result);return result;
};
