import type {Response} from "express";
import type {AuthenticatedRequest} from "../types/express.js";
import {ownedOperations,retryOperation,cancelOperation} from "../runtime/operations.js";
import {SessionStateError} from "../runtime/contracts.js";
function handler(action:"list"|"retry"|"cancel") {
  return async(req:AuthenticatedRequest,res:Response)=>{
    const user=req.user?.id || req.user?._id;if(!user){res.status(401).json({message:"Unauthorized"});return;}
    try {
      const session=String(req.params.sessionId),id=String(req.params.operationId);
      const result=action==="list"?await ownedOperations(session,user):action==="retry"?await retryOperation(session,user,id):await cancelOperation(session,user,id);
      res.json(action==="list"?{operations:result}:{operation:result});
    }catch(error){res.status(error instanceof SessionStateError?error.status:500).json({message:error instanceof SessionStateError?error.message:"Operation unavailable. Please refresh and retry."});}
  };
}
export const getOperations=handler("list"),retryInterviewOperation=handler("retry"),cancelInterviewOperation=handler("cancel");
