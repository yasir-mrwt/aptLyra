import { randomUUID, createHash } from "node:crypto";
import { query, withDatabaseLock } from "../config/db.js";
import { jaccard } from "../ingestion/localAdapter.js";
import { MODEL, RetrievalFailure, validateBatch, type Embedder, type Entity } from "./contracts.js";
import { EmbeddingClient } from "./embeddingClient.js";

export const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
export async function eligibleEntities(): Promise<Entity[]> {
  const rows=(await query("SELECT * FROM retrieval_entities ORDER BY purpose,entity_id LIMIT 1001")).rows as Entity[];
  if(rows.length>1000) throw new RetrievalFailure("corpus_budget_exceeded");
  for(const e of rows) if(digest(e.text)!==e.content_hash) throw new RetrievalFailure("content_hash_mismatch");
  return rows;
}
export function generationFingerprint(entities:Entity[],model:Record<string,unknown>=MODEL) {
  return "corpus-"+digest(JSON.stringify({model,entities:entities.map(e=>[e.entity_id,e.purpose,e.content_hash])}));
}
export function duplicateGroups(entities:Entity[]): Map<string,string> {
  const parent=new Map(entities.map(e=>[e.entity_id,e.entity_id]));
  const find=(id:string):string=>{const p=parent.get(id)!; if(p===id)return p; const root=find(p);parent.set(id,root);return root;};
  const merge=(a:string,b:string)=>{const x=find(a),y=find(b); if(x!==y)parent.set(x<y?y:x,x<y?x:y);};
  for(let i=0;i<entities.length;i++) for(let j=0;j<i;j++) {
    const a=entities[i],b=entities[j]; if(a.purpose!==b.purpose)continue;
    const retainedDocuments=a.provenance.some(p=>p.duplicateDecision==="retain-provenance" && Array.isArray(p.documentDuplicates)
      && p.documentDuplicates.some((d:any)=>b.provenance.some(bp=>bp.documentVersionId===d.documentVersionId)));
    if(a.content_hash===b.content_hash || (a.family_key && a.family_key===b.family_key)
      || a.duplicate_links.some(l=>l.candidateId===b.candidate_id)
      || b.duplicate_links.some(l=>l.candidateId===a.candidate_id)
      || (retainedDocuments && jaccard(a.text,b.text)>=0.8))merge(a.entity_id,b.entity_id);
  }
  return new Map(entities.map(e=>[e.entity_id,find(e.entity_id)]));
}

/** No network calls inside a database transaction. A failed run leaves the old generation active. */
export async function embedCorpus(embedder:Embedder=new EmbeddingClient(),dryRun=false) {
  const entities=await eligibleEntities(), generation=generationFingerprint(entities), groups=duplicateGroups(entities);
  const existing=(await query(`SELECT m.id,m.question_version_id,m.chunk_id,m.content_hash,m.model_id,m.model_revision,
      m.embedding_version,m.status,m.corpus_generation,v.value::text AS vector FROM embedding_metadata m JOIN embedding_vectors v ON v.metadata_id=m.id
      WHERE m.model_id=$1 AND m.model_revision=$2 AND m.embedding_version=$3 AND m.dimension=384 AND m.normalization='l2'
      ORDER BY (m.corpus_generation=$4),m.created_at`,[MODEL.modelId,MODEL.modelRevision,MODEL.embeddingVersion,generation])).rows;
  const reusable=new Map(existing.filter(m=>m.status!=="retired" && m.model_id===MODEL.modelId
    && m.model_revision===MODEL.modelRevision && m.embedding_version===MODEL.embeddingVersion)
    .map(m=>[m.question_version_id || m.chunk_id,m]));
  const needed=entities.filter(e=>reusable.get(e.entity_id)?.content_hash!==e.content_hash);
  const counts={eligible:entities.length,embedded:0,skipped:entities.length-needed.length,failed:0,corpusGeneration:generation,dryRun};
  if(dryRun)return {...counts,wouldEmbed:needed.length};
  await withDatabaseLock("ingestion:editorial:v1",async()=>{
    await query(`INSERT INTO embedding_generations(id,model_id,model_revision,dimension,normalization,embedding_version,entity_count)
      VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING`,
      [generation,MODEL.modelId,MODEL.modelRevision,384,"l2",MODEL.embeddingVersion,entities.length]);
    const state=(await query("SELECT status FROM embedding_generations WHERE id=$1",[generation])).rows[0].status;
    if(state==="retired")throw new RetrievalFailure("retired_generation_requires_new_version");
    if(generationFingerprint(await eligibleEntities())!==generation)throw new RetrievalFailure("corpus_changed_retry");
    for(const e of entities) {
      const previous=reusable.get(e.entity_id);
      if(!previous || previous.content_hash!==e.content_hash || previous.corpus_generation===generation)continue;
      const id=randomUUID();
      const saved=await query(`INSERT INTO embedding_metadata(id,question_version_id,chunk_id,purpose,model_id,model_revision,
        dimension,normalization,embedding_version,content_hash,corpus_generation)
        VALUES($1,$2,$3,$4,$5,$6,384,'l2',$7,$8,$9) ON CONFLICT DO NOTHING RETURNING id`,
        [id,e.entity_type==="question"?e.entity_id:null,e.entity_type==="chunk"?e.entity_id:null,e.purpose,
          MODEL.modelId,MODEL.modelRevision,MODEL.embeddingVersion,e.content_hash,generation]);
      if(saved.rows.length)await query("INSERT INTO embedding_vectors(metadata_id,duplicate_group,value) VALUES($1,$2,$3::vector)",
        [id,groups.get(e.entity_id),previous.vector]);
    }
  });
  try {
    for(let offset=0;offset<needed.length;offset+=16) {
      const batch=needed.slice(offset,offset+16);
      const result=validateBatch(await embedder.embed(batch.map(e=>e.text),"documents"),batch.length);
      await withDatabaseLock("ingestion:editorial:v1",async()=>{
        if(generationFingerprint(await eligibleEntities())!==generation)throw new RetrievalFailure("corpus_changed_retry");
        for(let i=0;i<batch.length;i++) {
          const e=batch[i],id=randomUUID();
          const saved=await query(`INSERT INTO embedding_metadata(id,question_version_id,chunk_id,purpose,model_id,
            model_revision,dimension,normalization,embedding_version,content_hash,corpus_generation)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING RETURNING id`,
            [id,e.entity_type==="question"?e.entity_id:null,e.entity_type==="chunk"?e.entity_id:null,e.purpose,
              MODEL.modelId,MODEL.modelRevision,384,"l2",MODEL.embeddingVersion,e.content_hash,generation]);
          if(saved.rows.length)await query("INSERT INTO embedding_vectors(metadata_id,duplicate_group,value) VALUES($1,$2,$3::vector)",
            [id,groups.get(e.entity_id),JSON.stringify(result.vectors[i])]);
        }
      });
      counts.embedded+=batch.length;
    }
    await withDatabaseLock("ingestion:editorial:v1",async()=>{
      if(generationFingerprint(await eligibleEntities())!==generation)throw new RetrievalFailure("corpus_changed_retry");
      const n=(await query(`SELECT count(*)::int AS n FROM embedding_metadata m JOIN embedding_vectors v ON v.metadata_id=m.id
        WHERE m.corpus_generation=$1 AND m.status<>'retired'`,[generation])).rows[0].n;
      if(n!==entities.length)throw new RetrievalFailure("incomplete_generation");
      await query("UPDATE embedding_metadata SET status='retired' WHERE status='active' AND corpus_generation<>$1",[generation]);
      await query("UPDATE embedding_generations SET status='retired' WHERE status='active' AND id<>$1",[generation]);
      await query("UPDATE embedding_generations SET status='active',activated_at=coalesce(activated_at,now()) WHERE id=$1",[generation]);
      await query("UPDATE embedding_metadata SET status='active' WHERE corpus_generation=$1 AND status='staged'",[generation]);
    });
    return counts;
  }catch(error) {
    counts.failed=needed.length-counts.embedded;
    const failure=new RetrievalFailure(error instanceof RetrievalFailure?error.code:"embedding_persistence_failed");
    Object.assign(failure,{summary:counts});throw failure;
  }
}
