import type {Question} from "../types/session";

export function evaluationStatus(question:Question):string {
  if(question.intentionallyUnanswered)return "Intentionally left unanswered · no score";
  if(question.answerLocked && !question.isEvaluated)return "Answer saved · evaluation unavailable";
  if(question.evaluation?.reasons.includes("practice_without_reviewed_scoring"))return "Provisional practice feedback — reviewed score withheld";
  if(question.evaluation)return question.evaluation.status==="abstained"?"Evaluation abstained":"Evaluation complete";
  if(question.isEvaluated)return "Evaluation complete · established starter feedback";
  return question.isSubmitted?"Evaluation pending":"Not submitted";
}
export function executionStatus(question:Question):string {
  if(question.questionType!=="coding")return "Execution not applicable to this oral/design answer";
  if(question.executionEvidence)return `Execution completed — ${question.executionEvidence.status}: ${question.executionEvidence.summary}`;
  const objective=question.evaluation?.objective;
  if(objective?.status==="passed"||objective?.status==="failed")return `Execution completed — ${objective.status}`;
  return question.isEvaluated && (question.evaluation?.status==="scored" || (!question.evaluation && typeof question.technicalScore==="number"))?"Evaluated by code review · Execution not run; no test result recorded":"Execution not run; no test result recorded";
}
export const reviewedCoverageExplanation="Individual practice scores and the reviewed aggregate measure different things. Only eligible original questions with reviewed rubrics count toward that aggregate. Established starter feedback and provisional dynamic feedback remain visible individually; they do not imply reviewed evidence.";

export function individualPractice(questions:Question[]){
 const scores=questions.flatMap(q=>{
  const score=q.evaluation?(q.evaluation.status==='scored'?q.evaluation.technicalScore:null):(q.isEvaluated?q.technicalScore:null);
  return typeof score==='number'&&Number.isFinite(score)&&score>=0&&score<=100?[score]:[];
 });
 return {mean:scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length*10)/10:null,scored:scores.length,total:questions.length,
 provisional:questions.filter(q=>q.evaluation?.reasons.includes('practice_without_reviewed_scoring')).length,
 unanswered:questions.filter(q=>q.intentionallyUnanswered||(!q.isSubmitted&&!q.answerLocked&&!q.isEvaluated)).length,
 missing:questions.filter(q=>!q.isEvaluated).length};
}
