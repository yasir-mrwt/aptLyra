import {useEffect,useRef} from 'react';
import {useGoogleOAuth} from '@react-oauth/google';
import type {GoogleLoginProps,CredentialResponse,IdConfiguration,GsiButtonConfiguration} from '@react-oauth/google';

// GIS is page-global. StrictMode and button rerenders must not reset its configuration.
type IdentityApi={initialize:(config:IdConfiguration)=>void;renderButton:(element:HTMLElement,options:GsiButtonConfiguration)=>void};
let initialized: {api: unknown; key: string}|undefined;
let receiver: ((value: CredentialResponse)=>void)|undefined;
export default function GoogleIdentityButton({nonce,onSuccess,onError,theme='outline',shape,size='large',text,width}:GoogleLoginProps){
 const {clientId,scriptLoadedSuccessfully}=useGoogleOAuth();
 const host=useRef<HTMLDivElement>(null),callbacks=useRef({onSuccess,onError});
 useEffect(()=>{callbacks.current={onSuccess,onError};},[onSuccess,onError]);
 useEffect(()=>{
  const api=(window as Window & {google?:{accounts:{id:IdentityApi}}}).google?.accounts.id;
  if(!scriptLoadedSuccessfully||!api||!host.current)return;
  const receive=(value:CredentialResponse)=>{if(value.credential)callbacks.current.onSuccess(value);else callbacks.current.onError?.();};
  receiver=receive;
  const key=JSON.stringify([clientId,nonce]);
  if(initialized?.api!==api||initialized?.key!==key){
   api.initialize({client_id:clientId,nonce,callback:value=>receiver?.(value)});
   initialized={api,key};
  }
  api.renderButton(host.current,{type:'standard',theme,shape,size,text,width});
  return()=>{if(receiver===receive)receiver=undefined;};
 },[clientId,nonce,scriptLoadedSuccessfully,theme,shape,size,text,width]);
 return <div ref={host}/>;
}
