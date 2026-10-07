/** Phase 7 policy. Provider data cannot choose weights, totals or reviewed status. */
export const POLICY = "rubric-v1";
export const PROMPT = "rubric-evaluator-v1";
export const WEIGHTS = Object.freeze({correctness:45,"concept-coverage":20,reasoning:20,"practical-application":10,"trade-off-awareness":5});
export type Dimension = keyof typeof WEIGHTS;
export type Confidence = "high"|"medium"|"low";
export type Judgment = "satisfied"|"partial"|"missing"|"contradicted"|"not-applicable";
export interface Concept {id:string; key:string; label:string; description:string; importance:number; required:boolean; sources:string[]}
export interface Reference {id:string; text:string}
export interface Rubric {id:string; kind:"known"|"provisional"; questionVersionId:string; concepts:Concept[]; references:Reference[]; hash:string}
export interface Objective {status:"passed"|"failed"|"unavailable"; kind:"runtime"|"reviewed-tests"; summary:string; codeHash?:string}
export interface ConceptJudgment {id:string; judgment:Judgment; explanation:string; sourceIds:string[]; span:{artifact:"answer"|"code";start:number;end:number}|null}
export interface EvaluationInput {question:string; questionVersionId:string; rubric:Rubric; answer:string; code:string; objective:Objective; derived:boolean; artifactUnavailable:boolean}
export interface ProviderResult {dimensions:Record<Dimension,number>; concepts:ConceptJudgment[]; confidence:Confidence; abstained:boolean; reason:string; feedback:string; communication:string; modelVersion:string; promptVersion:string}
export interface EvaluationView {id?:string; answerAttemptId?:string; rubricVersionId:string|null; rubricStatus:"reviewed"|"provisional"|"unavailable"; status:"scored"|"abstained"; technicalScore:number|null; dimensions:Partial<Record<Dimension,number>>; concepts:{id:string;label:string;judgment:Judgment;explanation:string;sourceIds:string[]}[]; evaluatorConfidence:Confidence; reasons:string[]; feedback:string; communication:string; objective:Objective; scoringVersion:string; promptVersion:string; modelVersion:string; followUpConceptId?:string}
export class EvaluationError extends Error {constructor(public code:string){super(code);}}
const bad=():never=>{throw new EvaluationError("invalid_evaluator_output");};
const object=(v:unknown):Record<string,any>=>v && typeof v==="object" && !Array.isArray(v)?v as Record<string,any>:bad();
const exact=(v:Record<string,any>,keys:string[])=>{if(Object.keys(v).sort().join()!==[...keys].sort().join())bad();};
const text=(v:unknown,max=2000)=>{if(typeof v!=="string" || !v.trim() || v.length>max)bad();return v as string;};
export function validateProvider(value:unknown,input:EvaluationInput):ProviderResult {
  const v=object(value);exact(v,["dimensions","concepts","confidence","abstained","reason","feedback","communication","modelVersion","promptVersion"]);
  const d=object(v.dimensions);exact(d,Object.keys(WEIGHTS));
  for(const n of Object.values(d))if(typeof n!=="number" || !Number.isFinite(n) || n<0 || n>4)bad();
  if(!["high","medium","low"].includes(v.confidence) || typeof v.abstained!=="boolean" || typeof v.reason!=="string" || v.reason.length>500 || (v.abstained && !v.reason.trim()))bad();
  if(!Array.isArray(v.concepts) || v.concepts.length!==input.rubric.concepts.length)bad();
  const seen=new Set<string>();
  for(const raw of v.concepts){
    const c=object(raw);exact(c,["id","judgment","explanation","sourceIds","span"]);
    const expected=input.rubric.concepts.find(x=>x.id===c.id);
    if(!expected || seen.has(c.id))bad();seen.add(c.id);
    if(!["satisfied","partial","missing","contradicted","not-applicable"].includes(c.judgment))bad();text(c.explanation,1000);
    if(!Array.isArray(c.sourceIds) || !c.sourceIds.length || new Set(c.sourceIds).size!==c.sourceIds.length || c.sourceIds.some((id:any)=>!expected!.sources.includes(id) || !input.rubric.references.some(r=>r.id===id)))bad();
    if(c.span!==null){const span=object(c.span);exact(span,["artifact","start","end"]);
      const answer=span.artifact==="answer"?input.answer:span.artifact==="code"?input.code:null;
      // Match Python/PostgreSQL character offsets, including astral Unicode text.
      if(answer===null || !Number.isInteger(span.start) || !Number.isInteger(span.end) || span.start<0 || span.end<=span.start || span.end>Array.from(answer).length)bad();
    }else if(["satisfied","partial","contradicted"].includes(c.judgment))bad();
  }
  text(v.feedback);text(v.communication,1000);text(v.modelVersion,100);if(v.promptVersion!==PROMPT)bad();
  return v as ProviderResult;
}
export function score(dimensions:Record<Dimension,number>):number {
  let sum=0;for(const [key,weight] of Object.entries(WEIGHTS)){const v=dimensions[key as Dimension];if(typeof v!=="number" || !Number.isFinite(v) || v<0 || v>4)bad();sum+=weight*v;}
  return Math.round(25*sum/100*10)/10;
}
export function finalize(input:EvaluationInput,raw:unknown):EvaluationView {
  const result=validateProvider(raw,input), reasons:string[]=[];
  const provisional=input.rubric.kind!=="known" || input.derived;
  let confidence=result.confidence;
  if(provisional){reasons.push("provisional_rubric");if(confidence==="high")confidence="medium";}
  if(input.code && input.objective.kind!=="reviewed-tests"){reasons.push("reviewed_tests_unavailable");if(confidence==="high")confidence="medium";}
  if(input.artifactUnavailable){reasons.push("artifact_unavailable");confidence="low";}
  if(result.concepts.some(c=>c.judgment==="not-applicable" && input.rubric.concepts.find(x=>x.id===c.id)?.required)){reasons.push("required_concept_unobservable");confidence="low";}
  if(result.abstained || confidence==="low"){reasons.push(result.abstained?"evaluator_abstained":"insufficient_evidence");confidence="low";}
  const dimensions={...result.dimensions};
  const total=input.rubric.concepts.reduce((s,c)=>s+c.importance,0);
  dimensions["concept-coverage"]=4*input.rubric.concepts.reduce((s,c)=>s+c.importance*({satisfied:1,partial:.5,missing:0,contradicted:0,"not-applicable":0}[result.concepts.find(j=>j.id===c.id)!.judgment]),0)/total;
  if(input.objective.status==="failed"){dimensions.correctness=0;reasons.push("objective_failure");}
  const gap=result.concepts.find(c=>["missing","partial","contradicted"].includes(c.judgment) && input.rubric.concepts.find(x=>x.id===c.id)?.required);
  return {rubricVersionId:input.rubric.id,rubricStatus:provisional?"provisional":"reviewed",status:confidence==="low"?"abstained":"scored",technicalScore:confidence==="low"?null:score(dimensions),dimensions,
    concepts:result.concepts.map(c=>({...c,label:input.rubric.concepts.find(x=>x.id===c.id)!.label})),evaluatorConfidence:confidence,reasons,
    feedback:result.abstained?"Score withheld: the evaluator could not establish sufficient answer evidence.":result.feedback,
    communication:result.communication,objective:input.objective,scoringVersion:POLICY,promptVersion:PROMPT,modelVersion:result.modelVersion,
    followUpConceptId:confidence!=="low"?gap?.id:undefined};
}
export function abstain(reason:string,objective:Objective):EvaluationView {
  return {rubricVersionId:null,rubricStatus:"unavailable",status:"abstained",technicalScore:null,dimensions:{},concepts:[],evaluatorConfidence:"low",reasons:[reason],feedback:"Score withheld: an approved technical reference and a usable versioned rubric are required. This answer was retained without a technical score.",communication:"Communication was not assessed.",objective,scoringVersion:POLICY,promptVersion:PROMPT,modelVersion:"not-invoked"};
}
export function reviewedAggregate(questions:{followUpOf?:number;primaryCompetency?:string;evaluation?:EvaluationView}[]) {
  const originals=questions.filter(q=>q.followUpOf===undefined);
  const eligible=originals.filter(q=>q.evaluation?.rubricStatus==="reviewed" && q.evaluation.status==="scored" && q.evaluation.evaluatorConfidence!=="low" && typeof q.evaluation.technicalScore==="number");
  const roots=[...new Set(originals.map(q=>(q.primaryCompetency || "unmapped").split('.')[0]))];
  const byRoot=Object.fromEntries(roots.map(root=>{const qs=eligible.filter(q=>(q.primaryCompetency || "unmapped").split('.')[0]===root);return [root,qs.length?Math.round(qs.reduce((s,q)=>s+q.evaluation!.technicalScore!,0)/qs.length*10)/10:null];}));
  const sufficient=eligible.length>=2 && eligible.length/originals.length>=.6 && Object.values(byRoot).every(n=>n!==null);
  const values=Object.values(byRoot) as (number|null)[];
  return {scoringVersion:POLICY,technicalScore:sufficient?Math.round(values.reduce<number>((s,n)=>s+n!,0)/values.length*10)/10:null,eligible:eligible.length,planned:originals.length,byRoot,
    provisional:originals.filter(q=>q.evaluation?.rubricStatus==="provisional").length,abstained:originals.filter(q=>q.evaluation?.status==="abstained").length,reason:sufficient?null:"insufficient_reviewed_coverage"};
}
