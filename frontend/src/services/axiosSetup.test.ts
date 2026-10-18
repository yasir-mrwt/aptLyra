import axios,{AxiosError,AxiosHeaders,type InternalAxiosRequestConfig} from 'axios';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {setupInterceptors} from './axiosSetup';
beforeEach(()=>localStorage.setItem('user',JSON.stringify({_id:'one'})));
afterEach(()=>{vi.restoreAllMocks();localStorage.clear();});
const rejected=(config:InternalAxiosRequestConfig,status=401)=>new AxiosError('Rejected',undefined,config,undefined,{status,statusText:'Rejected',data:{},headers:new AxiosHeaders(),config});
it('replays every deduplicated 401 waiter without mutating its shared error',async()=>{
 let shared:AxiosError|undefined;
 const api=axios.create({baseURL:'/api',adapter:async config=>{
   if(!(config as InternalAxiosRequestConfig&{_retry?:boolean})._retry){shared??=rejected(config);throw shared;}
   return {config,status:200,statusText:'OK',headers:{},data:'private result'};
 }});
 let release!:()=>void;
 const refresh=vi.spyOn(axios,'post').mockImplementation(()=>new Promise(resolve=>{release=()=>resolve({status:200});}));
 setupInterceptors(api);
 const results=Promise.all([api.get('/analytics'),api.get('/analytics')]);
 await vi.waitFor(()=>expect(refresh).toHaveBeenCalledTimes(1));release();
 expect((await results).map(r=>r.data)).toEqual(['private result','private result']);
 expect((shared?.config as {_retry?:boolean})._retry).toBeUndefined();
});
it('preserves forbidden responses and bad login credentials without refreshing',async()=>{
 const refresh=vi.spyOn(axios,'post');
 const api=axios.create({adapter:async config=>{throw rejected(config,config.url==='/review'?403:401);}});setupInterceptors(api);
 await expect(api.get('/review')).rejects.toMatchObject({response:{status:403}});
 await expect(api.post('user/login')).rejects.toMatchObject({response:{status:401}});
 expect(refresh).not.toHaveBeenCalled();
});
it('retries at most once and preserves a real repeated 401',async()=>{
 const refresh=vi.spyOn(axios,'post').mockResolvedValue({status:200});
 const api=axios.create({adapter:async config=>{throw rejected(config);}});setupInterceptors(api);
 await expect(api.get('/analytics')).rejects.toMatchObject({response:{status:401}});expect(refresh).toHaveBeenCalledTimes(1);
});
it('cancels a replay if the account changes during refresh',async()=>{
 let release!:()=>void;
 vi.spyOn(axios,'post').mockImplementation(()=>new Promise(resolve=>{release=()=>resolve({status:200});}));
 const api=axios.create({adapter:async config=>{throw rejected(config);}});setupInterceptors(api);
 const result=api.get('/analytics').catch(error=>error);
 await vi.waitFor(()=>expect(release).toBeDefined());localStorage.setItem('user',JSON.stringify({_id:'two'}));release();
 expect(axios.isCancel(await result)).toBe(true);
});
it('shares one refresh across auth and product clients',async()=>{
 const adapter=async(config:InternalAxiosRequestConfig)=>{if(!(config as {_retry?:boolean})._retry)throw rejected(config);return {config,status:200,statusText:'OK',headers:{},data:'ok'};};
 const auth=axios.create({adapter}),product=axios.create({adapter});setupInterceptors(auth);setupInterceptors(product);
 let release!:()=>void;const refresh=vi.spyOn(axios,'post').mockImplementation(()=>new Promise(resolve=>{release=()=>resolve({status:200});}));
 const results=Promise.all([auth.get('/user/profile'),product.get('/analytics')]);await vi.waitFor(()=>expect(refresh).toHaveBeenCalledTimes(1));release();await results;expect(refresh).toHaveBeenCalledTimes(1);
});
