import type {ISession} from "../models/Session.js";
import {query} from "../config/db.js";
import {rubricEditor} from "./rubrics.js";
import {reviewedAggregate} from "./contracts.js";

/** Current public availability; immutable historical grades stay in PostgreSQL. */
export async function publicEvaluationSession(session:ISession):Promise<ISession> {
  if(session.planId){
    const available=(await query("SELECT entity_id FROM retrieval_entities WHERE purpose='question-selection' AND entity_id=ANY($1::uuid[])",[session.questions.map(q=>q.questionVersionId).filter(Boolean)])).rows;
    session.questions=session.questions.map(q=>q.questionVersionId && !available.some(e=>e.entity_id===q.questionVersionId)
      ? {...q,questionText:"This planned question is no longer available. Return to setup for a fresh plan.",idealAnswer:"",aiFeedback:undefined,evidenceUnavailable:true}:q);
  }
  if(session.scoringVersion!=="rubric-v1")return session;
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
