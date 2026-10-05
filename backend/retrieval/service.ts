import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import { query, withDatabaseLock } from "../config/db.js";
import { knowledgeRepository } from "../repositories/knowledgeRepository.js";
import { digest } from "./corpus.js";
import { EmbeddingClient } from "./embeddingClient.js";
import { MODEL, RetrievalFailure, validateBatch, type Embedder, type Entity, type Filters, type Outcome,
  type Purpose, type Reason, type RetrievalRequest, type RetrievalResponse } from "./contracts.js";
import type { RetrievalInput } from "../types/knowledge.js";

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const normalize=(s:string)=>s.normalize("NFKC").trim().replace(/\s+/g," ").toLowerCase();
const keys=new Set(["taxonomyVersion","competencies","role","difficulties","categories","origins","qualities",
  "sourceStates","reviewStates","company","occurredAfter","occurredBefore","excludedFamilies","excludedVersions","alreadySelectedIds","sourceKeys","documentKeys"]);
function validDate(value:unknown) {
  return typeof value==="string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
}
function validate(request:RetrievalRequest): Filters {
  const f=request.filters || {};
  if(!f || typeof f!=="object" || Array.isArray(f) || Object.keys(f).some(k=>!keys.has(k))
    || typeof request.query!=="string" || !request.query.trim() || request.query.length>4000
    || (request.limit!==undefined && (!Number.isInteger(request.limit) || request.limit<1 || request.limit>5))
    || (request.candidatePool!==undefined && (!Number.isInteger(request.candidatePool) || request.candidatePool<5 || request.candidatePool>20))
    || (request.minimumSimilarity!==undefined && (!Number.isFinite(request.minimumSimilarity) || request.minimumSimilarity<0 || request.minimumSimilarity>1))
    || (f.taxonomyVersion!==undefined && (typeof f.taxonomyVersion!=="string" || f.taxonomyVersion.length>100))
    || (request.expectedCorpusGeneration!==undefined && !/^corpus-[0-9a-f]{64}$/.test(request.expectedCorpusGeneration))
    || (request.expectedModelRevision!==undefined && (typeof request.expectedModelRevision!=="string" || request.expectedModelRevision.length>100))
    || (request.strategy!==undefined && !["semantic","structured-seed"].includes(request.strategy))
    || (request.strategy==="structured-seed" && (!f.sourceKeys?.length || f.sourceKeys.some(k=>k!=="techvera-junior-se-seed-v1"))))
    throw new RetrievalFailure("invalid_filters");
  const choices:Record<string,string[]|null>={competencies:null,excludedFamilies:null,excludedVersions:null,alreadySelectedIds:null,sourceKeys:null,documentKeys:null,
    difficulties:["easy","standard","stretch"],categories:["conceptual-oral","scenario","coding","debugging","sql","system-design-lite"],
    origins:["retrieved","generated","adapted","fallback","follow-up"],qualities:["technical-reference","reported-experience","unverified"],
    sourceStates:["enabled"],reviewStates:["approved"]};
  for(const [key,allowed] of Object.entries(choices)) {
    const v=(f as any)[key];
    if(v!==undefined && (!Array.isArray(v) || v.length>100 || v.some(x=>typeof x!=="string" || !x || x.length>200
      || (allowed && !allowed.includes(x)) || (["excludedVersions","alreadySelectedIds"].includes(key) && !uuid.test(x)))))
      throw new RetrievalFailure("invalid_filters");
  }
  if(f.role!==undefined && !["Software Engineer","Backend Developer","Full Stack Developer"].includes(f.role))throw new RetrievalFailure("invalid_filters");
  if(f.company!==undefined && (typeof f.company!=="string" || !f.company.trim() || f.company.length>200))throw new RetrievalFailure("invalid_filters");
  if((f.occurredAfter!==undefined && !validDate(f.occurredAfter)) || (f.occurredBefore!==undefined && !validDate(f.occurredBefore))
    || (f.occurredAfter && f.occurredBefore && f.occurredAfter>f.occurredBefore))throw new RetrievalFailure("invalid_filters");
  return {...f,taxonomyVersion:f.taxonomyVersion || "junior-se-v1"};
}

export function filterSql(f:Filters,purpose:Purpose) {
  const params:unknown[]=[purpose]; const clauses=["e.purpose=$1"];
  const add=(value:unknown)=>{params.push(value);return `$${params.length}`;};
  if(purpose==="question-selection") {
    clauses.push(`e.taxonomy_version=${add(f.taxonomyVersion)}`);
    if(f.competencies?.length) {
      const p=add(f.competencies);
      clauses.push(`(e.primary_competency=ANY(${p}::text[]) OR split_part(e.primary_competency,'.',1)=ANY(${p}::text[])
        OR EXISTS(SELECT 1 FROM question_version_competencies qc WHERE qc.question_version_id=e.entity_id AND qc.taxonomy_version=e.taxonomy_version
          AND (qc.competency_id=ANY(${p}::text[]) OR split_part(qc.competency_id,'.',1)=ANY(${p}::text[]))))`);
    }
    if(f.role)clauses.push(`e.roles ? ${add(f.role)}`);
    for(const [key,column] of [["difficulties","difficulty"],["categories","category"],["origins","origin"]]) {
      const v=(f as any)[key]; if(v?.length)clauses.push(`e.${column}=ANY(${add(v)}::text[])`);
    }
    if(f.excludedFamilies?.length)clauses.push(`NOT e.family_key=ANY(${add(f.excludedFamilies)}::text[])`);
    const ids=[...(f.excludedVersions || []),...(f.alreadySelectedIds || [])];
    if(ids.length) {
      const p=add(ids);clauses.push(`NOT e.entity_id=ANY(${p}::uuid[]) AND NOT e.question_id=ANY(${p}::uuid[])
        AND NOT e.family_key IN (SELECT family_key FROM interview_questions iq LEFT JOIN question_versions qv ON qv.question_id=iq.id
          WHERE iq.id=ANY(${p}::uuid[]) OR qv.id=ANY(${p}::uuid[]))`);
    }
    if(ids.length || f.excludedFamilies?.length) {
      const selectedIds=add(ids),families=add(f.excludedFamilies || []);
      clauses.push(`NOT EXISTS(SELECT 1 FROM embedding_metadata own JOIN embedding_vectors own_vector ON own_vector.metadata_id=own.id
        JOIN embedding_vectors excluded_vector ON excluded_vector.duplicate_group=own_vector.duplicate_group
        JOIN embedding_metadata excluded ON excluded.id=excluded_vector.metadata_id AND excluded.corpus_generation=own.corpus_generation
        JOIN question_versions selected_version ON selected_version.id=excluded.question_version_id
        JOIN interview_questions selected_family ON selected_family.id=selected_version.question_id
        WHERE own.question_version_id=e.entity_id AND own.status='active'
          AND (selected_version.id=ANY(${selectedIds}::uuid[]) OR selected_version.question_id=ANY(${selectedIds}::uuid[])
            OR selected_family.family_key=ANY(${families}::text[])))`);
    }
  } else {
    // References have no invented taxonomy/role tags. Constrained requests need a real question-grounding link.
    if(f.competencies?.length || f.role || f.categories?.length || f.difficulties?.length || f.origins?.length) {
      const linked=filterSql({...f,company:undefined,occurredAfter:undefined,occurredBefore:undefined,qualities:undefined},"question-selection");
      const moved=linked.sql.replace(/\$(\d+)/g,(_,n)=>`$${Number(n)+params.length}`);
      params.push(...linked.params);
      clauses.push(`EXISTS(SELECT 1 FROM question_provenance qp JOIN retrieval_entities e ON e.entity_id=qp.question_version_id
        WHERE qp.chunk_id=m.chunk_id AND qp.relation='technical-grounding' AND ${moved})`);
    }
    const ids=[...(f.excludedVersions || []),...(f.alreadySelectedIds || [])];
    if(ids.length)clauses.push(`NOT e.entity_id=ANY(${add(ids)}::uuid[])`);
  }
  const lineage:string[]=[];
  if(f.sourceKeys?.length)clauses.push(`EXISTS(SELECT 1 FROM jsonb_array_elements(e.provenance) p JOIN sources s ON s.id=(p->>'sourceId')::uuid WHERE s.stable_key=ANY(${add(f.sourceKeys)}::text[]))`);
  if(f.documentKeys?.length)lineage.push(`p->>'externalKey'=ANY(${add(f.documentKeys)}::text[])`);
  if(f.qualities?.length)lineage.push(`p->>'quality'=ANY(${add(f.qualities)}::text[])`);
  if(f.company)lineage.push(`p->>'company'=${add(f.company)} AND p->>'sourceType'='voluntary-experience'`);
  if(f.occurredAfter)lineage.push(`(p->>'occurredOn')::date>=${add(f.occurredAfter)}::date`);
  if(f.occurredBefore)lineage.push(`(p->>'occurredOn')::date<=${add(f.occurredBefore)}::date`);
  // Known occurrence only, never publication/fetch as a substitute, and never future reports.
  if(f.occurredAfter || f.occurredBefore)lineage.push(`(p->>'occurredOn')::date<=CURRENT_DATE`);
  if(f.role && f.company)lineage.push(`p->>'experienceRole'=${add(f.role)}`);
  if(lineage.length)clauses.push(`EXISTS(SELECT 1 FROM jsonb_array_elements(e.provenance) p WHERE ${lineage.join(" AND ")})`);
  return {sql:clauses.join(" AND "),params};
}

type Candidate=Entity & {similarity:number|null; exact:boolean; representative:number; duplicate_group:string};
export class RetrievalService {
  constructor(private embedder:Embedder=new EmbeddingClient()) {}
  retrieveQuestions(request:RetrievalRequest) { return this.retrieve("question-selection",request); }
  retrieveTechnicalEvidence(request:RetrievalRequest) { return this.retrieve("technical-grounding",request); }
  private async retrieve(purpose:Purpose,request:RetrievalRequest):Promise<RetrievalResponse> {
    const started=performance.now(),operationKey=randomUUID();let filters:Filters={},generation:string|null=null;
    let embeddingMs=0,databaseMs=0;let candidates:Candidate[]=[];
    let outcome:Outcome="no_match",reason:Reason="no_relevant_hit";
    const selected=new Map<string,Reason>();
    let vector:number[]|null=null;let structured=false;
    try {
      filters=validate(request);
      const taxonomy=(await query("SELECT id FROM competencies WHERE taxonomy_version=$1 AND status='active'",[filters.taxonomyVersion])).rows;
      if(!taxonomy.length || filters.competencies?.some(id=>!taxonomy.some(c=>c.id===id)))throw new RetrievalFailure("invalid_filters");
      const active=(await query("SELECT * FROM embedding_generations WHERE status='active'")).rows[0];
      if(!active)throw new RetrievalFailure("corpus_unavailable");
      generation=active.id;
      if(Object.entries(MODEL).some(([k,v])=>active[{modelId:"model_id",modelRevision:"model_revision",embeddingVersion:"embedding_version",dimension:"dimension",normalization:"normalization"}[k]!]!==v)
        || (request.expectedModelRevision && request.expectedModelRevision!==MODEL.modelRevision))throw new RetrievalFailure("model_mismatch");
      if(request.expectedCorpusGeneration && request.expectedCorpusGeneration!==generation)throw new RetrievalFailure("corpus_unavailable");
      const available=(await query("SELECT count(*)::int AS n FROM retrieval_entities WHERE purpose=$1",[purpose])).rows[0].n;
      if(available) {
        const missing=(await query(`SELECT count(*)::int AS n FROM retrieval_entities e WHERE e.purpose=$1 AND NOT EXISTS
          (SELECT 1 FROM embedding_metadata m JOIN embedding_vectors ev ON ev.metadata_id=m.id
            WHERE coalesce(m.question_version_id,m.chunk_id)=e.entity_id AND m.purpose=e.purpose AND m.content_hash=e.content_hash
              AND m.status='active' AND m.corpus_generation=$2)`,[purpose,generation])).rows[0].n;
        if(missing)throw new RetrievalFailure("corpus_unavailable");
        if(request.strategy==="structured-seed")structured=true;
        else {
          const start=performance.now();const batch=validateBatch(await this.embedder.embed([request.query],"query"),1);
          vector=batch.vectors[0];embeddingMs=performance.now()-start;
        }
      } else reason="no_permitted_source";
    } catch(error) {
      const code=error instanceof RetrievalFailure?error.code:"model_unavailable";
      if(code==="invalid_filters"){outcome="invalid_filters";reason="invalid_filters";filters={};}
      else if(code==="model_mismatch"){outcome="model_mismatch";reason="model_mismatch";}
      else if(code==="corpus_unavailable"){outcome="corpus_unavailable";reason="corpus_unavailable";}
      else {outcome="unavailable";reason="model_unavailable";}
    }
    const response=await withDatabaseLock<RetrievalResponse>("ingestion:editorial:v1",async()=>{
      await query("SET LOCAL statement_timeout='5s'");
      if(vector || structured) {
        const current=(await query(`SELECT g.id,EXISTS(SELECT 1 FROM retrieval_entities e WHERE e.purpose=$1
          AND NOT EXISTS(SELECT 1 FROM embedding_metadata m JOIN embedding_vectors ev ON ev.metadata_id=m.id
            WHERE coalesce(m.question_version_id,m.chunk_id)=e.entity_id AND m.purpose=e.purpose
              AND m.content_hash=e.content_hash AND m.status='active' AND m.corpus_generation=g.id)) AS incomplete
          FROM embedding_generations g WHERE g.status='active'`,[purpose])).rows[0];
        if(current?.id!==generation || current.incomplete){outcome="corpus_unavailable";reason="corpus_unavailable";}
        else {
          const start=performance.now(),built=filterSql(filters,purpose);
          const add=(v:unknown)=>{built.params.push(v);return `$${built.params.length}`;};
          const g=add(generation),v=structured?null:add(JSON.stringify(vector)),q=add(normalize(request.query)),pool=add(request.candidatePool || 20);
          candidates=(await query(`WITH scored AS MATERIALIZED (
            SELECT e.*,ev.duplicate_group,${structured?"NULL::double precision":`least(1.0,greatest(-1.0,1-(ev.value <=> ${v}::vector)))`} AS similarity,
              lower(regexp_replace(btrim(e.text),'\\s+',' ','g'))=${q} AS exact
            FROM retrieval_entities e JOIN embedding_metadata m ON coalesce(m.question_version_id,m.chunk_id)=e.entity_id AND m.purpose=e.purpose
            JOIN embedding_vectors ev ON ev.metadata_id=m.id
            WHERE m.status='active' AND m.corpus_generation=${g} AND ${built.sql}
          ), ranked AS (
            SELECT *,(row_number() OVER(PARTITION BY duplicate_group ORDER BY exact DESC,similarity DESC,entity_id))::int AS representative FROM scored
          ), groups AS (
            SELECT duplicate_group FROM ranked WHERE representative=1 ORDER BY exact DESC,similarity DESC,entity_id LIMIT ${pool}
          ) SELECT r.* FROM ranked r JOIN groups USING(duplicate_group)
            ORDER BY (r.representative=1) DESC,exact DESC,similarity DESC,entity_id LIMIT 100`,built.params)).rows as Candidate[];
          databaseMs=performance.now()-start;
          for(const c of candidates) if(c.representative===1 && (structured || c.exact || (c.similarity ?? -1)>=(request.minimumSimilarity ?? 0.3))
            && selected.size<(request.limit || 5))selected.set(c.entity_id,structured?"reviewed_seed_available":c.exact?"exact_match":"semantic_match");
          outcome=selected.size?"success":"no_match";
          reason=selected.size?(structured?"reviewed_seed_available":candidates.some(c=>selected.get(c.entity_id)==="exact_match")?"exact_match":"semantic_match")
            : candidates.length?"no_relevant_hit":"no_permitted_source";
        }
      }
      const results:RetrievalInput["results"]=candidates.map((c,i)=>({questionVersionId:c.entity_type==="question"?c.entity_id:undefined,
        chunkId:c.entity_type==="chunk"?c.entity_id:undefined,rank:i+1,similarity:c.similarity ?? undefined,selected:selected.has(c.entity_id),
        reason:selected.get(c.entity_id) || (c.representative!==1?"duplicate_collapsed":!structured && (c.similarity ?? -1)<(request.minimumSimilarity ?? 0.3)?"below_threshold":"limit_excluded"),
        provenanceSnapshot:c.provenance}));
      const operationId=await knowledgeRepository.recordRetrieval(request.ownership?.userId ?? null,{operationKey,sessionId:request.ownership?.sessionId,queryHash:digest(typeof request.query==="string"?request.query:"invalid-query"),
        filters:JSON.parse(JSON.stringify(filters)),embeddingMetadata:{...MODEL,purpose,reason},corpusVersion:generation || "unavailable",
        sourcePolicyRevision:"source-policy-v1",outcome,cacheHit:false,results});
      return {operationId,outcome,reason,cacheHit:false,corpusGeneration:generation,
        timings:{embeddingMs,databaseMs,totalMs:performance.now()-started},
        hits:candidates.filter(c=>selected.has(c.entity_id)).map((c,i)=>({questionId:c.question_id,
          questionVersionId:c.entity_type==="question"?c.entity_id:null,chunkId:c.entity_type==="chunk"?c.entity_id:null,
          familyKey:c.family_key,text:c.text,competency:c.primary_competency,category:c.category,difficulty:c.difficulty,origin:c.origin,
          provenance:c.provenance,provenanceAvailable:true as const,similarity:c.similarity,rank:i+1,reason:selected.get(c.entity_id)!,
          retrievalOperationId:operationId,model:MODEL,corpusGeneration:generation!}))};
    });
    response.timings.totalMs=performance.now()-started;
    return response;
  }
}
