import type {ISession} from "../models/Session.js";
import {query} from "../config/db.js";
import {rubricEditor} from "./rubrics.js";
import {reviewedAggregate} from "./contracts.js";
import {publicOperation} from "../runtime/operations.js";

/** Current public availability; immutable historical grades stay in PostgreSQL. */
export async function publicEvaluationSession(session:ISession):Promise<ISession> {
  let completedReport:any=null;
  if(session.runtimeVersion==="aptlyra-runtime-v1"){
    session.operations=(await query("SELECT * FROM durable_operations WHERE session_id=$1 AND user_id=$2 AND runtime_version='aptlyra-runtime-v1' ORDER BY created_at,id",[session._id,session.user])).rows.map(publicOperation);
    if(session.status==="completed"){
      const report=(await query("SELECT * FROM interview_reports WHERE session_id=$1 AND user_id=$2",[session._id,session.user])).rows[0];
      if(report){completedReport=report;session.questions=report.questions;session.report={id:report.id,snapshotRevision:Number(report.snapshot_revision),createdAt:new Date(report.created_at).toISOString(),scoringVersion:report.scoring_version};}
    }
  }
  if(session.planId&&!completedReport){
    const available=(await query("SELECT entity_id FROM retrieval_entities WHERE purpose='question-selection' AND entity_id=ANY($1::uuid[])",[session.questions.map(q=>q.questionVersionId).filter(Boolean)])).rows;
    session.questions=session.questions.map(q=>q.questionVersionId && !available.some(e=>e.entity_id===q.questionVersionId)
      ? {...q,questionText:"This planned question is no longer available. Return to setup for a fresh plan.",idealAnswer:"",aiFeedback:undefined,evidenceUnavailable:true}:q);
  }
  if(session.scoringVersion!=="rubric-v1")return session;
  // A completed interview is an immutable historical report snapshot. Source withdrawal
  // removes future retrieval eligibility but must not rewrite that already issued report.
  if(completedReport){
    session.reviewedSummary=completedReport.summary?.reviewedSummary ?? session.reviewedSummary;
    session.overallScore=completedReport.summary?.metrics?.overallScore ?? completedReport.summary?.metrics?.technicalScore ?? session.overallScore;
    session.metrics={avgTechnical:session.overallScore,avgConfidence:completedReport.summary?.metrics?.avgConfidence ?? null};
    return session;
  }
  for(const q of session.questions){
    if(q.evaluation && (q.evidenceUnavailable || (q.evaluation.rubricVersionId && !await rubricEditor.load(q.questionVersionId!,q.evaluation.rubricVersionId)))){
      q.evaluation={...q.evaluation,status:"abstained",technicalScore:null,evaluatorConfidence:"low",dimensions:{},reasons:["historical_evidence_unavailable"],concepts:[],feedback:"Historical scoring evidence is no longer available. The original evaluation remains in the audit history.",followUpConceptId:undefined};
      delete q.technicalScore;delete q.aiFeedback;
    }
    q.idealAnswer="";
  }
  session.reviewedSummary=reviewedAggregate(session.questions);session.overallScore=session.reviewedSummary.technicalScore;session.metrics={avgTechnical:session.overallScore,avgConfidence:null};
  return session;
}
