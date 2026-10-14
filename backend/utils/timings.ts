import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";
// Only fixed stage labels and numeric metrics. Never log SQL, parameters or content.
export const timingContext = new AsyncLocalStorage<{requestId:string;stages:Record<string,{ms:number;count:number}>}>();
export function recordTiming(stage:string,ms:number) {
  const context=timingContext.getStore();if(!context)return;
  const value=context.stages[stage] ||= {ms:0,count:0};value.ms+=ms;value.count++;
}
export async function timed<T>(stage:string,fn:()=>Promise<T>):Promise<T> {
  const start=performance.now();try{return await fn();}finally{recordTiming(stage,performance.now()-start);}
}

export function recordCount(stage:string,count:number){const context=timingContext.getStore();if(context)context.stages[stage]={ms:0,count};}
