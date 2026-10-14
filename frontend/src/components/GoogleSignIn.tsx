import type {AxiosResponse} from "axios";
import {useEffect,useState} from "react";
import {GoogleLogin,GoogleOAuthProvider} from "@react-oauth/google";
import type {ComponentProps} from "react";
import api from "../services/apiClient";
import {isValidGoogleClientId} from "../services/googleLoginConfig";
let pending:Promise<AxiosResponse<{clientId:string;nonce:string}>>|null=null;
const getChallenge=()=>pending ||= api.get("/user/google/challenge",{timeout:10000}).finally(()=>{pending=null;});
// One authoritative public client ID from the verifier; no independently drifting Vite ID.
export default function GoogleSignIn(props:ComponentProps<typeof GoogleLogin>) {
  const [challenge,setChallenge]=useState<{clientId:string;nonce:string}|null>(null);
  const [error,setError]=useState(false);
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{let active=true;
    getChallenge().then(({data})=>{
      if(!isValidGoogleClientId(data.clientId)||typeof data.nonce!=="string")throw Error();
      if(active){setChallenge(data);setError(false);}
    }).catch(()=>{if(active)setError(true);});return()=>{active=false;};
  },[attempt]);
  if(error)return <p role="status" className="text-sm text-center">Google sign-in is temporarily unavailable. Email sign-in still works. <button type="button" onClick={()=>setAttempt(n=>n+1)} className="underline">Retry Google</button></p>;
  if(!challenge)return <p role="status" className="text-sm">Preparing Google sign-in…</p>;
  return <GoogleOAuthProvider clientId={challenge.clientId}><GoogleLogin {...props} nonce={challenge.nonce}/></GoogleOAuthProvider>;
}
