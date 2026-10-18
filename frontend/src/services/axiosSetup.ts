import {editorialQueryCache} from './editorialQueryCache';
import axios, {type AxiosInstance, type InternalAxiosRequestConfig} from 'axios';

type RetryConfig = InternalAxiosRequestConfig & {_retry?:boolean; _aptlyraAccount?:string|null};
const account=()=>{try{const user=JSON.parse(localStorage.getItem('user')||'null');return user?._id||user?.id||null;}catch{return null;}};
const AUTH_PATHS=['/user/login','/user/register','/user/google','/user/refresh','/user/verify-otp','/user/resend-otp','/user/forgot-password','/user/reset-password'];

// One cookie rotation owner, even when consumers configure separate Axios clients.
let refresh:Promise<void>|null=null;
export const setupInterceptors=(api:AxiosInstance)=>{
 api.interceptors.request.use(config=>{Object.assign(config,{_aptlyraAccount:account()});return config;});
 api.interceptors.response.use(response=>response,async error=>{
  const original=error.config as RetryConfig|undefined;
  const backendMessage=error.response?.data?.error?.message;
  if(typeof backendMessage==="string")error.message=backendMessage;
  const path='/'+(original?.url||'').replace(/^\//,'');
  if(error.response?.status!==401 || !original || original._retry || AUTH_PATHS.some(p=>path.startsWith(p)))return Promise.reject(error);
  const identity=original._aptlyraAccount===undefined?account():original._aptlyraAccount;
  if(identity!==account())throw new axios.CanceledError('Account changed');
  // Deduplicated reads can reject with the SAME AxiosError/config. Never mutate
  // that config: every waiter must await refresh and replay its own clone once.
  if(!refresh){
   const request=axios.post(`${api.defaults.baseURL||import.meta.env.VITE_API_URL||'http://localhost:5002/api'}/user/refresh`,{}, {withCredentials:true,timeout:15000})
    .then(()=>{if(identity!==account())throw new axios.CanceledError('Account changed');window.dispatchEvent(new Event('auth_token_refreshed'));})
    .catch(failure=>{
     if(identity===account() && axios.isAxiosError(failure) && failure.response?.status===401){
      editorialQueryCache.setIdentity(null);localStorage.removeItem('user');
      if(window.location.pathname!=='/login')window.location.assign('/login');
     }
     throw failure;
    }).finally(()=>{if(refresh===request)refresh=null;});
   refresh=request;
  }
  await refresh;
  if(identity!==account())throw new axios.CanceledError('Account changed');
  return api({...original,_retry:true} as RetryConfig);
 });
};
