import express from "express";
import asyncHandler from "express-async-handler";
import rateLimit from "express-rate-limit";
import { protect } from "../middleware/auth.js";
import { plannerService } from "../planner/service.js";
import { PlannerError, ROOTS, ROLES } from "../planner/contracts.js";
import { query } from "../config/db.js";
import type { AuthenticatedRequest } from "../types/express.js";

const router=express.Router();
router.use(protect);
const previewLimiter=rateLimit({windowMs:15*60*1000,limit:10,message:{code:"planning_rate_limit",message:"Too many plan previews. Try again later."}});
const messages: Record<string,string>={invalid_setup:"Choose 1–4 competencies, 3–10 questions, 15–60 minutes and the supported junior scope.",
  invalid_modifiers:"These modifiers are unsupported or invalid. Company/date constraints are never relaxed automatically.",
  plan_not_found:"Plan not found.",stale_corpus:"The corpus changed. Preview your plan again.",stale_retrieval:"Evidence changed. Preview your plan again.",
  plan_not_ready:"This plan cannot be confirmed. Review its coverage and warnings.",stale_revision:"This preview changed. Reload it before confirming.",
  corpus_unavailable:"Reviewed retrieval is unavailable. Ask the operator to publish and index the approved corpus, then retry.",
  planner_unavailable:"Planning is temporarily unavailable. Retry your preview.",planning_timeout:"Planning timed out. Retry your preview.",
  model_mismatch:"The retrieval model is incompatible. Ask the operator to refresh the index.",invalid_confirmation:"Reload the preview and confirm its current revision."};
const handle=(operation:(userId:string,req:AuthenticatedRequest)=>Promise<unknown>,status=200)=>asyncHandler(async(req:AuthenticatedRequest,res)=>{
  const userId=req.user?.id || req.user?._id;
  if(!userId){res.status(401).json({message:"Authentication required"});return;}
  try {res.status(status).json(await operation(String(userId),req));}
  catch(error){const e=error instanceof PlannerError?error:new PlannerError("planner_unavailable",503);
    res.status(e.status).json({code:e.code,message:messages[e.code] || "Planning could not complete. Change your setup or retry."});}
});
router.get("/capabilities",handle(async()=>{
  const companies=(await query(`SELECT DISTINCT p->>'company' AS label FROM retrieval_entities e,
    jsonb_array_elements(e.provenance) p WHERE e.purpose='question-selection' AND p->>'sourceType'='voluntary-experience'
      AND p->>'company' IS NOT NULL AND p->>'occurredOn' IS NOT NULL AND (p->>'occurredOn')::date<=CURRENT_DATE ORDER BY label LIMIT 100`)).rows.map(r=>r.label);
  return {roles:ROLES,roots:ROOTS,companies,modifiers:{company:companies.length>0,resume:false,jd:false,designLite:true}};
}));
router.post("/preview",previewLimiter,handle((id,req)=>plannerService.preview(id,req.body),201));
router.post("/confirm",handle((id,req)=>plannerService.confirm(id,req.body)));
router.get("/:id",handle((id,req)=>plannerService.get(id,req.params.id as string)));
export default router;
