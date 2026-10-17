import {editorialQueryCache} from "../../../services/editorialQueryCache";
/** Restore the owned durable résumé job and poll bounded status requests across navigation. */
import { useState, useEffect, useRef, useCallback } from "react";
import { getResume, getResumeStatus } from "../../../services/resumeApi";
import type { ResumeData, ResultTab } from "../types";
const pending=new Set(["pending","processing","parsed","analyzing","matching"]);
export const useResumeAnalysis = ({userId}:{userId?:string}) => {
  const [isUploading,setIsUploading]=useState(false),[status,setStatus]=useState<string|null>(null);
  const [resumeData,setResumeData]=useState<ResumeData|null>(null),[activeTab,setActiveTab]=useState<ResultTab>("extraction");
  const [streamingFeedbackText,setStreamingFeedbackText]=useState("");
  const [activeId,setActiveId]=useState<string|null>(null),[recoveryError,setRecoveryError]=useState("");
  const generation=useRef(0);
  const fetchResumeDetails=useCallback(async(id:string)=>{
    if(!userId)return;
    const token=++generation.current;
    setActiveId(id);localStorage.setItem(`aptlyra-resume:${userId}`,id);
    try{
      const data=await getResume(id);if(token!==generation.current)return;
      setStatus(data.status);setIsUploading(pending.has(data.status));
      setResumeData(data.status==="completed"?data:null);setRecoveryError("");
    }catch{if(token===generation.current){setRecoveryError("Could not load saved analysis. Retry; your uploaded job remains saved.");setIsUploading(false);}}
  },[userId]);
  useEffect(()=>{
    const id=userId?localStorage.getItem(`aptlyra-resume:${userId}`):null;
    const initialGeneration=generation.current;
    const timer=setTimeout(()=>{if(generation.current!==initialGeneration)return;setResumeData(null);setActiveId(null);setIsUploading(false);setStatus(null);if(id)void fetchResumeDetails(id);},0);
    return()=>{clearTimeout(timer);
      // This counter invalidates async requests; it is not a DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;};
  },[userId,fetchResumeDetails]);
  useEffect(()=>{
    if(!activeId||!userId||status==="completed"||status==="failed"||status==="invalid_document")return;
    let disposed=false,inFlight=false;
    const refresh=async()=>{
      if(inFlight||document.hidden)return;inFlight=true;
      try{const data=await getResumeStatus(activeId);if(disposed)return;
        setStatus(data.status);setRecoveryError("");setIsUploading(pending.has(data.status));
        if(data.status==="completed"){editorialQueryCache.invalidatePrefix("http:/resume");await fetchResumeDetails(activeId);}
      }catch{if(!disposed)setRecoveryError("Connection interrupted. Reconnecting to your saved analysis…");}
      finally{inFlight=false;}
    };
    const timer=setInterval(()=>void refresh(),4000);window.addEventListener("online",refresh);window.addEventListener("focus",refresh);
    return()=>{disposed=true;clearInterval(timer);window.removeEventListener("online",refresh);window.removeEventListener("focus",refresh);};
  },[activeId,userId,status,fetchResumeDetails]);
  const getStatusMessage=()=>({pending:"Job queued…",processing:"Extracting résumé text…",parsed:"Text extracted; preparing analysis…",analyzing:"Analyzing your résumé… Your job is saved; you can leave and return.",matching:"Comparing the job description…",failed:"Analysis needs attention",invalid_document:"Invalid document"}[status||""]||"Restoring saved analysis…");
  const handleResetAnalysis=()=>{generation.current++;if(userId)localStorage.removeItem(`aptlyra-resume:${userId}`);setActiveId(null);setResumeData(null);setStatus(null);setIsUploading(false);setActiveTab("extraction");setStreamingFeedbackText("");setRecoveryError("");};
  return {isUploading,setIsUploading,status,setStatus,resumeData,setResumeData,activeTab,setActiveTab,getStatusMessage,handleResetAnalysis,streamingFeedbackText,setStreamingFeedbackText,fetchResumeDetails,recoveryError,activeId};
};
