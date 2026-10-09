import { randomUUID } from "node:crypto";
import { query, withDatabaseLock } from "../config/db.js";
import { ingestionRepository } from "../repositories/ingestionRepository.js";
import { rubricEditor, hash as rubricHash } from "../evaluation/rubrics.js";
import { aiService } from "../services/aiService.js";
import { embedCorpus } from "../retrieval/corpus.js";
import { fail } from "../ingestion/localAdapter.js";
import { categories, difficulties, normalize, screen, sha256, validateContract } from "../ingestion/localAdapter.js";
import { knowledgeRepository } from "../repositories/knowledgeRepository.js";
import { jaccard } from "../ingestion/localAdapter.js";
import { EmbeddingClient } from "../retrieval/embeddingClient.js";
import { MODEL } from "../retrieval/contracts.js";
import { REVIEWED_SEED_INPUT_HASH } from "../retrieval/contracts.js";
import type { Embedder } from "../retrieval/contracts.js";

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reviewerFor=async(userId:string)=>{
  const reviewer=(await query(`SELECT r.id,r.display_name,u.app_role FROM ingestion_reviewers r JOIN users u ON u.id=r.user_id
    WHERE r.user_id=$1 AND r.enabled AND r.kind='human' AND u.app_role IN ('owner','admin','reviewer')`,[userId])).rows[0];
  if(!reviewer)fail("reviewer-not-authorized");return reviewer;
};
const reasonCode=(value:string)=>/^[a-z][a-z0-9-]{1,99}$/.test(value)?value:"reviewer-note";
const event=async(questionVersionId:string,reviewerId:string,action:string,hash:string,metadata:Record<string,unknown>={},reason?:string)=>{
  const source=(await query(`SELECT s.id FROM question_versions q JOIN question_provenance p ON p.question_version_id=q.id
    JOIN source_document_versions v ON v.id=p.document_version_id JOIN source_documents d ON d.id=v.document_id JOIN sources s ON s.id=d.source_id
    WHERE q.id=$1 ORDER BY s.id LIMIT 1`,[questionVersionId])).rows[0];
  if(source)await query(`INSERT INTO ingestion_review_events(id,source_id,action,reviewer_id,content_hash,reason_code,event_metadata)
    VALUES($1,$2,$3,$4,$5,$6,$7)`,[randomUUID(),source.id,action,reviewerId,hash,reason || null,JSON.stringify(metadata)]);
};

export const contentEditorial={
  async approveSourceRecord(userId:string,recordId:string,expectedHash:string,duplicateDecision?:string){
    const reviewer=await reviewerFor(userId);return ingestionRepository.approveDocument(recordId,reviewer.id,expectedHash,duplicateDecision);
  },
  async publishSourceRecord(userId:string,recordId:string){
    await reviewerFor(userId);return ingestionRepository.publishDocument(recordId);
  },
  async rejectSourceRecord(userId:string,recordId:string,reason:string){
    const reviewer=await reviewerFor(userId);return ingestionRepository.rejectDocument(recordId,reviewer.id,reason);
  },
  async extractSubmission(userId:string,recordId:string,expectedHash:string,invocation:"reviewer"|"permission-authorized-worker"="reviewer"){
    const reviewer=await reviewerFor(userId);
    if(!uuid.test(recordId))fail("invalid-id");
      const submission=(await query(`SELECT r.id,r.source_id,r.document_version_id,r.input_hash,r.state,r.expires_at,
        v.normalized_text,e.role,e.company_label,e.occurred_on,e.round_type,e.topics,e.ai_processing_consent,s.model_processing_allowed
        FROM ingestion_records r JOIN sources s ON s.id=r.source_id JOIN source_document_versions v ON v.id=r.document_version_id
        JOIN interview_experience_records e ON e.document_version_id=v.id WHERE r.id=$1`,[recordId])).rows[0];
      if(!submission||submission.state!=="review_required"||!submission.normalized_text||new Date(submission.expires_at)<=new Date())fail("submission-unavailable");
      if(submission.input_hash!==expectedHash)fail("review-hash-mismatch");
      if(!submission.ai_processing_consent)fail("ai-processing-consent-required");
      if(!submission.model_processing_allowed)fail("source-ai-processing-disallowed");
      const priorCandidates=(await query("SELECT count(*)::int AS count FROM ingestion_candidates WHERE record_id=$1",[recordId])).rows[0].count;
      if(priorCandidates>0)await query(`INSERT INTO ingestion_review_events(id,source_id,record_id,reviewer_id,action,content_hash,reason_code,event_metadata)
        VALUES($1,$2,$3,$4,'re-extraction-requested',$5,'reviewer-requested',$6)`,[randomUUID(),submission.source_id,recordId,reviewer.id,submission.input_hash,
        JSON.stringify({priorCandidateCount:priorCandidates,aiApproved:false,invocation})]);
      const allowed=(await knowledgeRepository.listCompetencies("junior-se-v1")).filter(x=>x.kind==="child"&&x.status==="active").map(x=>x.id);
      let proposal:any;
      try {
        proposal=await aiService.extractInterviewExperience({sourceText:submission.normalized_text,role:submission.role,company:submission.company_label,
          occurredOn:submission.occurred_on?new Date(submission.occurred_on).toISOString().slice(0,10):null,datePrecision:submission.occurred_on?"day":"unknown",
          roundType:submission.round_type,topics:submission.topics,allowedCompetencies:allowed});
      } catch(error) {
        const upstreamCode=(error as {code?:unknown})?.code;
        if(upstreamCode==="invalid_extraction_output"||upstreamCode==="extraction_schema_validation_failed"||upstreamCode==="extraction_semantic_validation_failed"||upstreamCode==="malformed_model_json"||upstreamCode==="invalid_provider_response"){
          const category=(error as {category?:unknown})?.category;
          const safeCode=["malformed_model_json","extraction_schema_validation_failed","extraction_semantic_validation_failed"].includes(String(upstreamCode))?String(upstreamCode):"invalid-ai-output";
          fail(`${safeCode}:${typeof category==="string"&&/^[a-z0-9_-]{1,60}$/.test(category)?category:"invalid_provider_response"}`);
        }
        if(upstreamCode==="provider_authentication"||upstreamCode==="provider_configuration"||upstreamCode==="provider_model_unavailable")fail("ai-provider-configuration");
        if(upstreamCode==="provider_rate_limited")fail("ai-provider-rate-limited");
        if(upstreamCode==="provider_timeout")fail("ai-provider-timeout");
        fail("ai-provider-unavailable");
      }
      if(proposal?.contractVersion!=="interview-extraction-v1"||!Array.isArray(proposal.candidates)||proposal.candidates.length<1||proposal.candidates.length>10)fail("invalid-extraction-output");
      let proposalVectors:number[][]=[];
      try{proposalVectors=(await new EmbeddingClient().embed(proposal.candidates.map((candidate:any)=>String(candidate.question)),"documents")).vectors;}catch{/* Duplicate suggestions are best effort; publication still requires its own active embedding generation. */}
      return withDatabaseLock(`content-extraction:${recordId}`,async()=>{
      const current=(await query(`SELECT r.state,r.input_hash,r.expires_at,v.normalized_text,e.ai_processing_consent,s.model_processing_allowed
        FROM ingestion_records r JOIN sources s ON s.id=r.source_id JOIN source_document_versions v ON v.id=r.document_version_id
        JOIN interview_experience_records e ON e.document_version_id=v.id WHERE r.id=$1 FOR UPDATE OF r,s,v,e`,[recordId])).rows[0];
      if(!current||current.state!=="review_required"||current.input_hash!==expectedHash||current.normalized_text!==submission.normalized_text||
        !current.ai_processing_consent||!current.model_processing_allowed||new Date(current.expires_at)<=new Date())fail("submission-changed-during-extraction");
      const source=String(submission.normalized_text),chars=Array.from(source),allowedSet=new Set(allowed),chunk=(await query("SELECT id FROM source_chunks WHERE document_version_id=$1 AND status<>'retired' ORDER BY chunk_index LIMIT 1",[submission.document_version_id])).rows[0];
      if(!chunk)fail("chunk-not-available");
      const existing=(await query("SELECT id,content_hash,specification,duplicate_links FROM ingestion_candidates WHERE state NOT IN ('rejected','withdrawn') ORDER BY id LIMIT 1001")).rows;
      if(existing.length>1000)fail("dedupe-budget-exceeded");
      const created:string[]=[];
      for(let proposalIndex=0;proposalIndex<proposal.candidates.length;proposalIndex++){
        const c=proposal.candidates[proposalIndex];
        if(!c||typeof c!=="object"||c.role!==submission.role||c.company!==(submission.company_label||null)||c.occurredOn!==(submission.occurred_on?new Date(submission.occurred_on).toISOString().slice(0,10):null)||
          c.datePrecision!==(submission.occurred_on?"day":"unknown")||c.roundType!==(submission.round_type||null)||!allowedSet.has(c.taxonomy)||!categories.includes(c.category)||!difficulties.includes(c.difficulty)||
          typeof c.language!=="string"||c.language.length<2||c.language.length>40||!Array.isArray(c.topics)||!c.topics.length||c.topics.length>10||c.topics.some((topic:unknown)=>typeof topic!=="string"||!topic.trim()||topic.length>120)||
          !["direct","paraphrased","topic-derived"].includes(c.derivationType)||!Number.isFinite(c.confidence)||c.confidence<0||c.confidence>1||
          !Number.isInteger(c.evidenceStart)||!Number.isInteger(c.evidenceEnd)||c.evidenceStart<0||c.evidenceEnd<=c.evidenceStart||c.evidenceEnd>chars.length||
          chars.slice(c.evidenceStart,c.evidenceEnd).join("")!==c.evidenceText)fail("invalid-extraction-output");
        const text=normalize(String(c.question||""));if(Buffer.byteLength(text)>1000||screen(text).length)fail("unsafe-question");
        const spec={text,category:c.category,difficulty:c.difficulty,primary:c.taxonomy,secondary:[],roles:[c.role]};
        const hash=sha256(text);if((await query("SELECT 1 FROM ingestion_candidates WHERE record_id=$1 AND content_hash=$2",[recordId,hash])).rows.length)continue;
        const start=Array.from(source).slice(0,c.evidenceStart).join("").length,end=Array.from(source).slice(0,c.evidenceEnd).join("").length,id=randomUUID();
        const links:any[]=existing.map((old:any)=>({candidateId:old.id,kind:old.content_hash===hash?"exact":"near",similarity:old.content_hash===hash?1:jaccard(old.specification?.text||"",text)}))
          .filter((link:any)=>link.kind==="exact"||link.similarity>=0.8);
        for(const old of existing){
          if(!links.some((link:any)=>link.candidateId===old.id)&&!links.some((link:any)=>link.similarity>=0.8))continue;
          for(const group of Array.isArray(old.duplicate_links)?old.duplicate_links:[])if(group.candidateId&&!links.some((link:any)=>link.candidateId===group.candidateId))links.push({...group,kind:"family"});
        }
        const vector=proposalVectors[proposalIndex];
        if(vector){
          const semantic=(await query(`SELECT c.id AS candidate_id,ev.duplicate_group,greatest(-1.0,least(1.0,1-(ev.value <=> $1::vector))) AS similarity
            FROM embedding_metadata em JOIN embedding_vectors ev ON ev.metadata_id=em.id JOIN question_versions q ON q.id=em.question_version_id
            JOIN ingestion_candidates c ON c.question_version_id=q.id AND c.state IN ('approved','published')
            WHERE em.purpose='question-selection' AND em.status='active' AND em.model_id=$2 AND em.model_revision=$3
              AND em.embedding_version=$4 ORDER BY ev.value <=> $1::vector LIMIT 5`,[JSON.stringify(vector),MODEL.modelId,MODEL.modelRevision,MODEL.embeddingVersion])).rows;
          for(const match of semantic)if(!links.some((link:any)=>link.candidateId===match.candidate_id))links.push({candidateId:match.candidate_id,kind:"semantic",similarity:Number(match.similarity),duplicateGroup:match.duplicate_group});
        }
        const metadata={role:c.role,company:c.company,occurredOn:c.occurredOn,datePrecision:c.datePrecision,roundType:c.roundType,taxonomy:c.taxonomy,
          language:c.language,topics:c.topics,evidenceText:c.evidenceText,evidenceStart:c.evidenceStart,evidenceEnd:c.evidenceEnd};
        await query(`INSERT INTO ingestion_candidates(id,record_id,chunk_id,specification,content_hash,evidence_start,evidence_end,duplicate_links,extraction_method,
          derivation_type,extraction_contract,confidence,extraction_metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'model-proposal-v1',$9,'interview-extraction-v1',$10,$11)`,
        [id,recordId,chunk.id,JSON.stringify(spec),hash,start,end,JSON.stringify(links),c.derivationType,c.confidence,JSON.stringify(metadata)]);created.push(id);existing.push({id,content_hash:hash,specification:spec,duplicate_links:links});
      }
      await query(`INSERT INTO ingestion_review_events(id,source_id,record_id,reviewer_id,action,content_hash,reason_code,event_metadata)
        VALUES($1,$2,$3,$4,'extracted',$5,$6,$7)`,[randomUUID(),submission.source_id,recordId,reviewer.id,submission.input_hash,
        invocation==='reviewer'?'model-proposal':'permission-authorized-worker',JSON.stringify({contractVersion:"interview-extraction-v1",proposalCount:created.length,aiApproved:false,invocation})]);
      return {recordId,candidateIds:created,aiApproved:false};
      });
  },
  async reviewCandidate(userId:string,candidateId:string,expectedHash:string,requestId?:string){
    const reviewer=await reviewerFor(userId);
    if(!uuid.test(candidateId)||!/^[a-f0-9]{64}$/.test(expectedHash))fail("invalid-id");
    return withDatabaseLock(`candidate-ai-review:${candidateId}`,async()=>{
      const candidate=(await query(`SELECT c.id,c.state,c.specification,c.content_hash,c.duplicate_links,c.extraction_metadata,c.question_version_id,
          (SELECT ready.publication_class FROM content_question_readiness ready WHERE ready.question_version_id=c.question_version_id) AS publication_class,
          r.id AS record_id,r.source_id,r.document_version_id,r.input_hash,v.normalized_text,v.title AS source_title,
          s.source_type,s.stable_key,s.model_processing_allowed,e.ai_processing_consent
        FROM ingestion_candidates c JOIN ingestion_records r ON r.id=c.record_id JOIN sources s ON s.id=r.source_id
        LEFT JOIN source_document_versions v ON v.id=r.document_version_id
        LEFT JOIN interview_experience_records e ON e.document_version_id=r.document_version_id
        WHERE c.id=$1 FOR UPDATE OF c,r,s`,[candidateId])).rows[0];
      if(!candidate||candidate.content_hash!==expectedHash)fail("review-hash-mismatch");
      if(!["review_required","approved","published"].includes(candidate.state))fail("candidate-not-reviewable");
      if(candidate.source_type==="user_submission"&&!candidate.ai_processing_consent)fail("ai-processing-consent-required");
      if(!candidate.model_processing_allowed){
        if(candidate.source_type==="authored"&&["techvera-junior-se-v1","techvera-junior-se-seed-v1"].includes(candidate.stable_key)&&candidate.input_hash===REVIEWED_SEED_INPUT_HASH)
          fail("seed-source-permission-not-enabled");
        fail("source-ai-processing-disallowed");
      }
      const question=String(candidate.specification?.text||"");
      if(!question||Buffer.byteLength(question)>1000)fail("candidate-not-reviewable");
      const eligibleReferences=candidate.question_version_id?(await query(`SELECT count(*)::int AS count FROM question_technical_references tr
        JOIN source_chunks c ON c.id=tr.chunk_id JOIN source_document_versions v ON v.id=c.document_version_id
        JOIN source_documents d ON d.id=v.document_id JOIN sources s ON s.id=d.source_id
        WHERE tr.question_version_id=$1 AND tr.state='approved' AND c.status='active' AND v.status='published'
          AND v.content_hash=tr.source_version_hash AND v.quality='technical-reference' AND v.permission_status='permitted'
          AND v.review_status='approved' AND v.pii_status='clear' AND v.confidentiality_status='clear'
          AND s.state='enabled' AND s.permission_status='permitted' AND s.review_status='approved'
          AND s.permission_evidence_hash=tr.permission_hash AND s.withdrawn_at IS NULL`,[candidate.question_version_id])).rows[0].count:0;
      const competencies=await knowledgeRepository.listCompetencies("junior-se-v1");
      const allowedCompetencies=competencies.filter((item:any)=>item.kind==="child"&&item.status==="active").map((item:any)=>item.id);
      // Interview reports are not technical evidence. Only send explicitly model-permitted source excerpts.
      const evidenceText=candidate.model_processing_allowed&&candidate.ai_processing_consent
        ?String(candidate.extraction_metadata?.evidenceText||"").slice(0,1000)||null:null;
      let packet:any;
      try{packet=await aiService.reviewEditorialCandidate({question,allowedCompetencies,allowedCategories:[...categories],evidenceText,
        similarQuestions:[]},requestId) as any;}
      catch(error){
        const safeCode=(error as {code?:unknown})?.code;
        if(safeCode==="malformed_model_json")fail("malformed_model_json:malformed_model_json");
        if(safeCode==="editorial_schema_validation_failed")fail("editorial_schema_validation_failed:schema_validation");
        if(safeCode==="editorial_semantic_validation_failed")fail("editorial_semantic_validation_failed:semantic_validation");
        if(safeCode==="invalid_review_output"||safeCode==="invalid_provider_response")fail("invalid-review-output");
        if(safeCode==="provider_authentication"||safeCode==="provider_configuration"||safeCode==="provider_model_unavailable")fail("ai-provider-configuration");
        if(safeCode==="provider_rate_limited")fail("ai-provider-rate-limited");
        if(safeCode==="provider_timeout")fail("ai-provider-timeout");
        fail("ai-provider-unavailable");
      }
      const flags=["irrelevant","ambiguous","duplicate","technically-suspicious","weak-evidence","needs-human-review"];
      if(packet?.contractVersion!=="editorial-review-v1"||!(["relevant","borderline","irrelevant"].includes(packet.relevance))||
        !(["recommend-approve","recommend-edit","recommend-reject"].includes(packet.verdict))||!allowedCompetencies.includes(packet.taxonomy)||
        !categories.includes(packet.category)||!difficulties.includes(packet.difficulty)||typeof packet.duplicateWarning!=="boolean"||
        !Array.isArray(packet.wordingIssues)||packet.wordingIssues.length>8||
        !(packet.correctedQuestion===null||typeof packet.correctedQuestion==="string"&&packet.correctedQuestion.length<=1000)||
        !(["supported","uncertain","suspicious"].includes(packet.technicalCorrectness))||!Array.isArray(packet.expectedConcepts)||
        packet.expectedConcepts.length<1||packet.expectedConcepts.length>12||!(["present","weak","missing"].includes(packet.evidenceStatus))||
        typeof packet.evidenceSummary!=="string"||packet.evidenceSummary.length>500||!Array.isArray(packet.rubricGuidance)||packet.rubricGuidance.length>12||
        !(["low","medium","high"].includes(packet.confidence))||!Array.isArray(packet.flags)||packet.flags.some((flag:string)=>!flags.includes(flag))||
        !packet.flags.includes("needs-human-review")||(packet.relevance==="irrelevant"&&packet.verdict!=="recommend-reject"))fail("invalid-review-output");
      // Reference state is calculated from reviewed source permissions, never trusted from the model.
      packet.referenceStatus=eligibleReferences>0?"eligible-reviewed-reference":"no-reviewed-reference";
      packet.eligibleReferenceCount=eligibleReferences;
      packet.taxonomyRoot=competencies.find((item:any)=>item.id===packet.taxonomy)?.parent_id||null;
      if(candidate.publication_class!=="reviewed/scoring-ready"&&packet.confidence==="high")packet.confidence="medium";
      const packetHash=sha256(JSON.stringify(packet));
      const prior=(await query("SELECT COALESCE(max(version),0)::int AS version FROM candidate_ai_review_packets WHERE candidate_id=$1 AND content_hash=$2",[candidateId,expectedHash])).rows[0].version;
      const row=(await query(`INSERT INTO candidate_ai_review_packets(id,candidate_id,content_hash,packet_hash,version,contract_version,packet,created_by)
        VALUES($1,$2,$3,$4,$5,'editorial-review-v1',$6,$7) RETURNING id,version,packet_hash,created_at`,
        [randomUUID(),candidateId,expectedHash,packetHash,prior+1,JSON.stringify(packet),userId])).rows[0];
      if(candidate.source_id)await query(`INSERT INTO ingestion_review_events(id,source_id,record_id,candidate_id,reviewer_id,action,content_hash,reason_code,event_metadata)
        VALUES($1,$2,$3,$4,$5,'ai-review-proposed',$6,'human-review-required',$7)`,[randomUUID(),candidate.source_id,candidate.record_id,candidateId,reviewer.id,expectedHash,
        JSON.stringify({packetId:row.id,packetHash:row.packet_hash,version:row.version,aiApproved:false})]);
      return {...row,packet,aiApproved:false};
    });
  },
  async manualReferenceQueue(userId:string){
    await reviewerFor(userId);
    return (await query(`SELECT r.id AS record_id,r.input_hash,v.content_hash,v.title,v.normalized_text,s.title AS source_name
      FROM ingestion_records r JOIN sources s ON s.id=r.source_id JOIN source_document_versions v ON v.id=r.document_version_id
      WHERE s.origin='aptlyra-reviewer-authored-reference-v1' AND r.state='review_required' AND v.status='quarantined'
        AND r.expires_at>now() ORDER BY r.created_at LIMIT 50`)).rows;
  },
  async createManualReference(userId:string,value:unknown){
    const reviewer=await reviewerFor(userId),input=value as Record<string,unknown>;
    if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).some(key=>!['title','text','permissionEvidence','attribution','authorshipAttested'].includes(key))||
      input.authorshipAttested!==true||typeof input.title!=="string"||!input.title.trim()||Buffer.byteLength(input.title)>200||
      typeof input.text!=="string"||!input.text.trim()||Buffer.byteLength(input.text)>8000||typeof input.permissionEvidence!=="string"||
      !input.permissionEvidence.trim()||Buffer.byteLength(input.permissionEvidence)>1200||
      (input.attribution!==undefined&&(typeof input.attribution!=="string"||Buffer.byteLength(input.attribution)>1000)))fail("invalid-manual-reference");
    const title=String(input.title).trim(),text=normalize(String(input.text)),signals=screen(text);
    if(!text||Buffer.byteLength(text)>8000||signals.length)fail(signals.length?`manual-reference-screened:${signals[0]}`:"invalid-manual-reference");
    const hash=sha256(text),sourceId=randomUUID(),documentId=randomUUID(),versionId=randomUUID(),chunkId=randomUUID(),recordId=randomUUID();
    const permissionEvidence=String(input.permissionEvidence).trim();
    const contract=validateContract({adapterId:"local-file",version:"1",sourceType:"authored",allowedInputs:[`/operator-authored/${recordId}.md`],
      approvedInputHashes:[hash],permissionEvidence,licenseId:"aptlyra-reviewer-authored",termsRevision:"manual-reference-v1",
      attribution:typeof input.attribution==="string"?input.attribution.trim():"Aptlyra reviewer-authored material",authentication:"operator-filesystem",
      refresh:"manual",maxBytes:262144,timeoutMs:5000,maxDocuments:1,minIntervalMs:0,
      timestampSemantics:"occurrence-explicit-fetch-observed",withdrawal:"retire-and-redact",retainRaw:false,fixture:false});
    return withDatabaseLock("manual-technical-reference:v1",async()=>{
      await query(`INSERT INTO sources(id,stable_key,source_type,title,origin,permission_status,license_id,terms_revision,policy_revision,permission_evidence,
        attribution,review_status,state,adapter_name,permission_basis,allowed_scope,rate_limit,raw_retention,full_text_storage,derived_facts_storage,model_processing_allowed)
        VALUES($1,$2,'authored',$3,'aptlyra-reviewer-authored-reference-v1','unknown',$4,'manual-reference-v1','content-policy-v1',$5,$6,
          'proposed','disabled','local-file','reviewer-authorship-pending','{"scope":"manual-review"}','{}',interval '30 days',true,true,false)`,
      [sourceId,`aptlyra-manual-reference:${sourceId}`,title,contract.licenseId,permissionEvidence,contract.attribution]);
      await query("INSERT INTO ingestion_adapters(source_id,adapter_id,adapter_version,contract) VALUES($1,'local-file','1',$2)",[sourceId,JSON.stringify(contract)]);
      await query("INSERT INTO source_documents(id,source_id,external_key) VALUES($1,$2,$3)",[documentId,sourceId,recordId]);
      await query(`INSERT INTO source_document_versions(id,document_id,version,title,fetched_at,content_hash,normalized_text,permission_status,policy_revision,
        review_status,quality,pii_status,confidentiality_status,status) VALUES($1,$2,1,$3,now(),$4,$5,'unknown','content-policy-v1',
        'pending','unverified','pending','pending','quarantined')`,[versionId,documentId,title,hash,text]);
      await query(`INSERT INTO source_chunks(id,document_version_id,chunk_index,excerpt,content_hash,chunker_version,section,start_offset,end_offset,status)
        VALUES($1,$2,0,$3,$4,'manual-reference-v1','reviewer-authored technical reference',0,char_length($3),'staged')`,[chunkId,versionId,text,hash]);
      await query(`INSERT INTO ingestion_records(id,source_id,document_version_id,input_hash,state,signals,draft_questions,duplicates)
        VALUES($1,$2,$3,$4,'review_required','[]','[]','[]')`,[recordId,sourceId,versionId,hash]);
      await query(`INSERT INTO ingestion_review_events(id,source_id,record_id,reviewer_id,action,content_hash,reason_code,event_metadata)
        VALUES($1,$2,$3,$4,'received',$5,'manual-reference-created',$6),($7,$2,$3,$4,'review-required',$5,'human-review-required',$8)`,
      [randomUUID(),sourceId,recordId,reviewer.id,hash,JSON.stringify({sourceType:"reviewer-authored",approved:false}),randomUUID(),JSON.stringify({approved:false})]);
      return {recordId,contentHash:hash,state:"review_required",approved:false};
    });
  },
  async approveManualReference(userId:string,recordId:string,expectedHash:string,embedder:Embedder=new EmbeddingClient()){
    const reviewer=await reviewerFor(userId);
    if(!uuid.test(recordId)||!/^[a-f0-9]{64}$/.test(expectedHash))fail("invalid-id");
    return withDatabaseLock(`manual-reference-approval:${recordId}`,async()=>{
      const item=(await query(`SELECT r.id,r.source_id,r.input_hash,r.state,v.content_hash,s.origin,s.state AS source_state,s.permission_evidence,
        v.status AS document_status FROM ingestion_records r JOIN sources s ON s.id=r.source_id
        JOIN source_document_versions v ON v.id=r.document_version_id WHERE r.id=$1 FOR UPDATE OF r,s,v`,[recordId])).rows[0];
      if(!item||item.origin!=="aptlyra-reviewer-authored-reference-v1"||item.state!=="review_required"||item.document_status!=="quarantined"||
        item.source_state!=="disabled"||item.input_hash!==expectedHash||item.content_hash!==expectedHash)fail("review-hash-mismatch");
      const permissionHash=sha256(JSON.stringify({recordId,contentHash:expectedHash,permissionEvidence:item.permission_evidence}));
      await query(`UPDATE sources SET permission_status='permitted',review_status='approved',state='enabled',reviewed_by=$2,reviewed_at=now(),
        permission_basis='human-reviewed-authorship-attestation',permission_evidence_hash=$3,permission_reviewed_hash=$3 WHERE id=$1`,
      [item.source_id,reviewer.id,permissionHash]);
      await query(`INSERT INTO ingestion_review_events(id,source_id,record_id,reviewer_id,action,content_hash,reason_code,event_metadata)
        VALUES($1,$2,$3,$4,'source-approved',$5,'manual-authorship-reviewed',$6)`,
      [randomUUID(),item.source_id,recordId,reviewer.id,expectedHash,JSON.stringify({permissionHash,sourceType:"reviewer-authored",aiApproved:false})]);
      await query("UPDATE source_document_versions SET permission_status='permitted' WHERE id=(SELECT document_version_id FROM ingestion_records WHERE id=$1)",[recordId]);
      await ingestionRepository.approveTechnicalReference(recordId,reviewer.id,expectedHash);
      await ingestionRepository.publishDocument(recordId);
      let embeddingReady=true,errorCode:string|undefined;
      try{await embedCorpus(embedder);}catch(error){embeddingReady=false;errorCode=(error as {code?:string})?.code||"embedding_unavailable";}
      return {recordId,contentHash:expectedHash,state:"published",reviewedBy:reviewer.id,embeddingReady,...(errorCode?{errorCode}:{})};
    });
  },
  async candidateQueue(userId:string){
    await reviewerFor(userId);
    return (await query(`SELECT c.id AS candidate_id,c.state,c.specification,c.content_hash,c.derivation_type,c.extraction_contract,c.confidence,c.extraction_metadata,
      c.evidence_start,c.evidence_end,c.duplicate_links,c.duplicate_of,r.id AS record_id,r.state AS record_state,r.expires_at,
      v.normalized_text,s.id AS source_id,CASE WHEN s.stable_key IN ('techvera-junior-se-v1','techvera-junior-se-seed-v1')
        THEN 'Aptlyra reviewed junior SE seed' ELSE s.title END AS source_name,s.source_type,s.origin,s.permission_status,s.review_status,
      e.company_label,e.role,e.occurred_on,e.round_type,e.topics,e.ai_processing_consent,s.model_processing_allowed,
      (SELECT jsonb_build_object('id',p.id,'version',p.version,'hash',p.packet_hash,'createdAt',p.created_at,'packet',p.packet)
        FROM candidate_ai_review_packets p WHERE p.candidate_id=c.id AND p.content_hash=c.content_hash ORDER BY p.version DESC LIMIT 1) AS ai_review
      FROM ingestion_candidates c JOIN ingestion_records r ON r.id=c.record_id
      JOIN sources s ON s.id=r.source_id LEFT JOIN source_document_versions v ON v.id=r.document_version_id
      LEFT JOIN interview_experience_records e ON e.document_version_id=r.document_version_id
      WHERE c.state IN ('review_required','approved','published') AND r.expires_at>now() AND r.state NOT IN ('withdrawn','rejected')
        AND NOT (r.input_hash=$1 AND s.source_type='authored'
          AND s.stable_key IN ('techvera-junior-se-v1','techvera-junior-se-seed-v1'))
        AND NOT EXISTS(SELECT 1 FROM content_question_readiness ready
          WHERE ready.question_version_id=c.question_version_id AND ready.inventory_class='DYNAMIC_REVIEWED')
      ORDER BY r.created_at,c.id LIMIT 100`,[REVIEWED_SEED_INPUT_HASH])).rows;
  },
  async competencies(userId:string){
    await reviewerFor(userId);
    return (await knowledgeRepository.listCompetencies("junior-se-v1")).filter((item:any)=>item.kind==="child"&&item.status==="active")
      .map((item:any)=>({id:item.id,label:item.display_name,parentId:item.parent_id}));
  },
  async createManualQuestion(userId:string,value:unknown){
    const reviewer=await reviewerFor(userId),input=value as Record<string,unknown>;
    const allowedKeys=["recordId","question","topic","mode","difficulty","sourceNote","authorshipAttested","allowAi"];
    if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).some(key=>!allowedKeys.includes(key))||
      typeof input.question!=="string"||!input.question.trim()||Buffer.byteLength(input.question)>2000||
      typeof input.topic!=="string"||typeof input.mode!=="string"||!['coding','oral'].includes(input.mode)||
      typeof input.difficulty!=="string"||!difficulties.includes(input.difficulty as typeof difficulties[number])||input.authorshipAttested!==true||
      (input.recordId!==undefined&&(typeof input.recordId!=="string"||!uuid.test(input.recordId)))||
      (input.sourceNote!==undefined&&(typeof input.sourceNote!=="string"||Buffer.byteLength(input.sourceNote)>1000))||
      (input.allowAi!==undefined&&typeof input.allowAi!=="boolean"))fail("invalid-manual-question");
    const question=normalize(String(input.question)),signals=screen(question),questionHash=sha256(question);
    if(!question||Buffer.byteLength(question)>1000||signals.length)fail("unsafe-question");
    const category=input.mode==="coding"?"coding":"conceptual-oral",difficulty=String(input.difficulty),topic=String(input.topic);
    const competency=(await query("SELECT id FROM competencies WHERE taxonomy_version='junior-se-v1' AND id=$1 AND kind='child' AND status='active'",[topic])).rows[0];
    if(!competency)fail("invalid-manual-question");
    return withDatabaseLock("manual-question:v1",async()=>{
      let recordId=typeof input.recordId==="string"?input.recordId:"",sourceId="",versionId="",chunkId="",normalizedText=question,sourceType="authored";
      if(recordId){
        const record=(await query(`SELECT r.id,r.source_id,r.document_version_id,r.input_hash,r.state,r.expires_at,v.normalized_text,
            s.source_type,e.role,e.practice_consent,e.right_to_share,e.ai_processing_consent
          FROM ingestion_records r JOIN sources s ON s.id=r.source_id
          JOIN source_document_versions v ON v.id=r.document_version_id
          JOIN interview_experience_records e ON e.document_version_id=v.id WHERE r.id=$1 FOR UPDATE OF r,s,v,e`,[recordId])).rows[0];
        if(!record||record.state!=="review_required"||record.source_type!=="user_submission"||!record.practice_consent||!record.right_to_share||
          !record.normalized_text||new Date(record.expires_at)<=new Date())fail("submission-unavailable");
        sourceId=record.source_id;versionId=record.document_version_id;normalizedText=record.normalized_text;sourceType=record.source_type;
        chunkId=(await query("SELECT id FROM source_chunks WHERE document_version_id=$1 AND status<>'retired' ORDER BY chunk_index LIMIT 1",[versionId])).rows[0]?.id;
        if(!chunkId)fail("chunk-not-available");
        if((await query("SELECT 1 FROM ingestion_candidates WHERE record_id=$1 AND content_hash=$2",[recordId,questionHash])).rows.length)
          fail("duplicate-manual-question");
      }else{
        recordId=randomUUID();sourceId=randomUUID();versionId=randomUUID();chunkId=randomUUID();
        const evidence=`Reviewer-authored question; authorship and right-to-share attested by ${reviewer.id}.`;
        const permissionHash=sha256(evidence);
        const contract=validateContract({adapterId:"local-file",version:"1",sourceType:"authored",allowedInputs:[`/reviewer-authored/${recordId}.md`],
          approvedInputHashes:[questionHash],permissionEvidence:evidence,licenseId:"aptlyra-reviewer-authored",termsRevision:"manual-question-v1",
          attribution:"Aptlyra reviewer-authored question",authentication:"operator-filesystem",refresh:"manual",maxBytes:262144,
          timeoutMs:5000,maxDocuments:1,minIntervalMs:0,timestampSemantics:"occurrence-explicit-fetch-observed",withdrawal:"retire-and-redact",
          retainRaw:false,fixture:false});
        await query(`INSERT INTO sources(id,stable_key,source_type,title,origin,permission_status,license_id,terms_revision,policy_revision,permission_evidence,
            attribution,review_status,state,adapter_name,permission_basis,allowed_scope,rate_limit,raw_retention,full_text_storage,derived_facts_storage,
            model_processing_allowed,reviewed_by,reviewed_at,permission_evidence_hash,permission_reviewed_hash)
          VALUES($1,$2,'authored','Reviewer-authored interview question','aptlyra-reviewer-authored-question-v1','permitted',$3,'manual-question-v1',
            'content-policy-v1',$4,$5,'approved','enabled','local-file','human-authorship-attestation','{"scope":"single-reviewer-authored-question"}',
            '{}',interval '30 days',false,true,$6,$7,now(),$8,$8)`,[sourceId,`aptlyra-manual-question:${sourceId}`,contract.licenseId,evidence,contract.attribution,
          input.allowAi===true,reviewer.id,permissionHash]);
        await query("INSERT INTO ingestion_adapters(source_id,adapter_id,adapter_version,contract) VALUES($1,'local-file','1',$2)",[sourceId,JSON.stringify(contract)]);
        await query("INSERT INTO source_documents(id,source_id,external_key) VALUES($1,$2,$3)",[randomUUID(),sourceId,recordId]);
        const documentId=(await query("SELECT id FROM source_documents WHERE source_id=$1 AND external_key=$2",[sourceId,recordId])).rows[0].id;
        const documentHash=sha256(normalizedText);
        await query(`INSERT INTO source_document_versions(id,document_id,version,title,fetched_at,content_hash,normalized_text,permission_status,policy_revision,
            review_status,quality,pii_status,confidentiality_status,status)
          VALUES($1,$2,1,'Reviewer-authored interview question',now(),$3,$4,'permitted','content-policy-v1','pending','unverified','clear','clear','quarantined')`,
          [versionId,documentId,documentHash,normalizedText]);
        await query(`INSERT INTO source_chunks(id,document_version_id,chunk_index,excerpt,content_hash,chunker_version,section,start_offset,end_offset,status)
          VALUES($1,$2,0,$3,$4,'reviewer-question-v1','reviewer-authored question',0,char_length($3),'staged')`,[chunkId,versionId,normalizedText,documentHash]);
        await query(`INSERT INTO ingestion_records(id,source_id,document_version_id,input_hash,state,signals,draft_questions,duplicates)
          VALUES($1,$2,$3,$4,'review_required','[]','[]','[]')`,[recordId,sourceId,versionId,documentHash]);
        await query(`INSERT INTO ingestion_review_events(id,source_id,record_id,reviewer_id,action,content_hash,reason_code,event_metadata)
          VALUES($1,$2,$3,$4,'source-approved',$5,'reviewer-authorship-attested',$6)`,
          [randomUUID(),sourceId,recordId,reviewer.id,documentHash,JSON.stringify({humanReviewed:true,authoredQuestion:true,aiProcessingAllowed:input.allowAi===true})]);
      }
      const start=normalizedText.indexOf(question),evidenceStart=start>=0?start:0,evidenceEnd=start>=0?start+question.length:normalizedText.length;
      const specification={text:question,category,difficulty,primary:topic,secondary:[],roles:["Software Engineer","Backend Developer","Full Stack Developer"]};
      const candidateId=randomUUID();
      await query(`INSERT INTO ingestion_candidates(id,record_id,chunk_id,specification,content_hash,evidence_start,evidence_end,extraction_method,
          derivation_type,extraction_contract,confidence,extraction_metadata)
        VALUES($1,$2,$3,$4,$5,$6,$7,'structured-local-v1','topic-derived','manual-review-v1',NULL,$8)`,
        [candidateId,recordId,chunkId,JSON.stringify(specification),questionHash,evidenceStart,evidenceEnd,
          JSON.stringify({manual:true,sourceNote:typeof input.sourceNote==="string"?input.sourceNote.trim():null,sourceType,aiApproved:false})]);
      await query(`INSERT INTO ingestion_review_events(id,source_id,record_id,candidate_id,reviewer_id,action,content_hash,reason_code,event_metadata)
        VALUES($1,$2,$3,$4,$5,'manual-question-added',$6,'human-authored-question',$7)`,
        [randomUUID(),sourceId,recordId,candidateId,reviewer.id,questionHash,JSON.stringify({manual:true,aiApproved:false,fromSubmission:Boolean(input.recordId)})]);
      return {candidateId,recordId,contentHash:questionHash,state:"review_required",aiApproved:false};
    });
  },
  async approveQuestion(userId:string,id:string,expectedHash:string,decision?:string){
    const reviewer=await reviewerFor(userId);
    const lineage=(await query(`SELECT c.record_id,r.input_hash,s.origin FROM ingestion_candidates c
      JOIN ingestion_records r ON r.id=c.record_id JOIN sources s ON s.id=r.source_id WHERE c.id=$1`,[id])).rows[0];
    const approved=await ingestionRepository.approveQuestion(id,reviewer.id,expectedHash,decision);
    if(lineage?.origin==="aptlyra-reviewer-authored-question-v1"){
      await ingestionRepository.approveDocument(lineage.record_id,reviewer.id,lineage.input_hash);
      await ingestionRepository.publishDocument(lineage.record_id);
    }
    return approved;
  },
  async editApproveQuestion(userId:string,id:string,expectedHash:string,specification:unknown,derivation:"paraphrased"|"topic-derived"="paraphrased"){
    const reviewer=await reviewerFor(userId);return ingestionRepository.editAndApproveQuestion(id,reviewer.id,expectedHash,specification,derivation);
  },
  async rejectQuestion(userId:string,id:string,expectedHash:string,reason:string){
    const reviewer=await reviewerFor(userId);return ingestionRepository.rejectQuestion(id,reviewer.id,reason,expectedHash);
  },
  async duplicateQuestion(userId:string,id:string,expectedHash:string,duplicateOf:string,reason:string){
    const reviewer=await reviewerFor(userId);return ingestionRepository.markDuplicateQuestion(id,reviewer.id,expectedHash,duplicateOf,reason);
  },
  async linkQuestionFamily(userId:string,id:string,expectedHash:string,relatedId:string){
    const reviewer=await reviewerFor(userId);
    if(!uuid.test(id)||!uuid.test(relatedId)||id===relatedId)fail("invalid-id");
    return withDatabaseLock("ingestion:editorial:v1",async()=>{
      const rows=(await query(`SELECT c.id,c.record_id,c.content_hash,c.state,c.duplicate_links,r.source_id
        FROM ingestion_candidates c JOIN ingestion_records r ON r.id=c.record_id WHERE c.id=ANY($1::uuid[]) ORDER BY c.id FOR UPDATE OF c`,[[id,relatedId]])).rows;
      const current=rows.find((row:any)=>row.id===id),related=rows.find((row:any)=>row.id===relatedId);
      if(!current||!related||current.content_hash!==expectedHash)fail("review-hash-mismatch");
      if(!["review_required","approved","published"].includes(current.state)||!["approved","published"].includes(related.state))fail("candidate-not-reviewable");
      for(const [candidate,target] of [[current,related],[related,current]] as any){
        const links=Array.isArray(candidate.duplicate_links)?candidate.duplicate_links:[];
        if(!links.some((link:any)=>link.candidateId===target.id&&link.kind==="family"))links.push({candidateId:target.id,kind:"family",reviewed:true});
        await query("UPDATE ingestion_candidates SET duplicate_links=$2 WHERE id=$1",[candidate.id,JSON.stringify(links)]);
      }
      await query(`INSERT INTO ingestion_review_events(id,source_id,record_id,candidate_id,reviewer_id,action,content_hash,reason_code,event_metadata)
        VALUES($1,$2,$3,$4,$5,'family-linked',$6,'reviewer-linked-family',$7)`,[randomUUID(),current.source_id,current.record_id,id,reviewer.id,expectedHash,JSON.stringify({relatedCandidateId:relatedId})]);
      return {candidateId:id,relatedCandidateId:relatedId,state:"family-linked"};
    });
  },
  async supersedeQuestion(userId:string,id:string,expectedHash:string,supersedesId:string){
    const reviewer=await reviewerFor(userId);
    if(!uuid.test(id)||!uuid.test(supersedesId)||id===supersedesId)fail("invalid-id");
    return withDatabaseLock("ingestion:editorial:v1",async()=>{
      const rows=(await query(`SELECT c.id,c.record_id,c.content_hash,c.state,c.question_version_id,r.source_id
        FROM ingestion_candidates c JOIN ingestion_records r ON r.id=c.record_id WHERE c.id=ANY($1::uuid[]) ORDER BY c.id FOR UPDATE OF c`,[[id,supersedesId]])).rows;
      const current=rows.find((row:any)=>row.id===id),prior=rows.find((row:any)=>row.id===supersedesId);
      if(!current||!prior||current.content_hash!==expectedHash)fail("review-hash-mismatch");
      if(current.state!=="published"||prior.state!=="published"||!prior.question_version_id)fail("candidate-not-supersedable");
      await query("UPDATE ingestion_candidates SET supersedes_id=$2 WHERE id=$1",[id,supersedesId]);
      await query("UPDATE ingestion_candidates SET state='superseded' WHERE id=$1",[supersedesId]);
      await query("UPDATE question_versions SET status='retired' WHERE id=$1",[prior.question_version_id]);
      await query(`INSERT INTO ingestion_review_events(id,source_id,record_id,candidate_id,reviewer_id,action,content_hash,reason_code,event_metadata)
        VALUES($1,$2,$3,$4,$5,'superseded',$6,'reviewer-superseded',$7)`,[randomUUID(),prior.source_id,prior.record_id,supersedesId,reviewer.id,prior.content_hash,
        JSON.stringify({replacementCandidateId:id,replacementHash:expectedHash,priorQuestionVersionId:prior.question_version_id})]);
      return {candidateId:id,supersedesId,state:"superseded"};
    });
  },
  async withdrawQuestion(userId:string,id:string,expectedHash:string,reason:string){
    const reviewer=await reviewerFor(userId);return ingestionRepository.withdrawQuestion(id,reviewer.id,reason,expectedHash);
  },
  async scoringQueue(userId:string){
    await reviewerFor(userId);
    return (await query(`SELECT q.id AS question_version_id,q.question_id,q.question_text,q.category,q.difficulty,q.content_hash,q.status,candidate.id AS candidate_id,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',tr.id,'chunkId',tr.chunk_id,'state',tr.state,'hash',tr.source_version_hash,'text',e.text,
        'sourceTitle',dv.title,'sourceId',s.id,'licenseId',s.license_id,'permissionHash',tr.permission_hash,'documentVersionId',dv.id,
        'version',dv.version,'chunkHash',c.content_hash,'startOffset',c.start_offset,'endOffset',c.end_offset)
        ORDER BY tr.reviewed_at) FROM question_technical_references tr JOIN retrieval_entities e ON e.entity_id=tr.chunk_id AND e.purpose='technical-grounding'
        JOIN source_chunks c ON c.id=tr.chunk_id JOIN source_document_versions dv ON dv.id=c.document_version_id
        JOIN source_documents d ON d.id=dv.document_id JOIN sources s ON s.id=d.source_id WHERE tr.question_version_id=q.id),'[]'::jsonb) AS technical_references,
      (SELECT rv.id FROM rubric_versions rv WHERE rv.question_version_id=q.id AND rv.status IN ('reviewed','provisional') ORDER BY rv.version DESC LIMIT 1) AS rubric_version_id,
      (SELECT rv.kind FROM rubric_versions rv WHERE rv.question_version_id=q.id AND rv.status IN ('reviewed','provisional') ORDER BY rv.version DESC LIMIT 1) AS rubric_kind,
      (SELECT rv.content_hash FROM rubric_versions rv WHERE rv.question_version_id=q.id AND rv.status IN ('reviewed','provisional') ORDER BY rv.version DESC LIMIT 1) AS rubric_hash,
      (SELECT rd.content FROM rubric_versions rv JOIN rubric_drafts rd ON rd.id=rv.draft_id WHERE rv.question_version_id=q.id AND rv.status IN ('reviewed','provisional') ORDER BY rv.version DESC LIMIT 1) AS rubric_content,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',d.id,'hash',d.content_hash,'content',d.content)
        ORDER BY d.created_at DESC) FROM rubric_drafts d WHERE d.question_version_id=q.id),'[]'::jsonb) AS drafts,
      ready.publication_class,ready.inventory_class
      FROM question_versions q JOIN content_question_readiness ready ON ready.question_version_id=q.id
      LEFT JOIN ingestion_candidates candidate ON candidate.question_version_id=q.id AND candidate.state='published'
      WHERE q.status='published' AND ready.inventory_class IS DISTINCT FROM 'TRUSTED_BASELINE'
        AND ready.inventory_class IS DISTINCT FROM 'DYNAMIC_REVIEWED'
      ORDER BY ready.publication_class,q.created_at DESC LIMIT 200`)).rows;
  },
  async interviewBank(userId:string){
    await reviewerFor(userId);
    const rows=(await query(`SELECT q.id AS question_version_id,q.question_text,q.category,q.difficulty,q.primary_competency,
        competency.display_name AS topic,ready.inventory_class,
        CASE WHEN ready.inventory_class='TRUSTED_BASELINE' THEN 'Aptlyra starter'
          WHEN EXISTS(SELECT 1 FROM question_provenance provenance JOIN source_document_versions version ON version.id=provenance.document_version_id
            JOIN source_documents document ON document.id=version.document_id JOIN sources source ON source.id=document.source_id
            WHERE provenance.question_version_id=q.id AND source.source_type='user_submission') THEN 'User submitted'
          WHEN EXISTS(SELECT 1 FROM question_provenance provenance JOIN source_document_versions version ON version.id=provenance.document_version_id
            JOIN source_documents document ON document.id=version.document_id JOIN sources source ON source.id=document.source_id
            WHERE provenance.question_version_id=q.id AND source.origin LIKE 'aptlyra-reviewer-%') THEN 'User submitted'
          ELSE 'Research/import' END AS origin,
        'Ready for interviews' AS display_status
      FROM question_versions q JOIN content_question_readiness ready ON ready.question_version_id=q.id
      JOIN competencies competency ON competency.taxonomy_version=q.taxonomy_version AND competency.id=q.primary_competency
      WHERE q.status='published' AND ready.inventory_class IN ('TRUSTED_BASELINE','DYNAMIC_REVIEWED')
        AND EXISTS(SELECT 1 FROM embedding_metadata metadata JOIN embedding_vectors vector ON vector.metadata_id=metadata.id
          WHERE metadata.question_version_id=q.id AND metadata.purpose='question-selection' AND metadata.status='active')
      ORDER BY CASE ready.inventory_class WHEN 'TRUSTED_BASELINE' THEN 0 ELSE 1 END,competency.display_name,q.difficulty,q.question_text`)).rows;
    return {starterQuestions:rows.filter(row=>row.inventory_class==='TRUSTED_BASELINE').length,
      approvedNewQuestions:rows.filter(row=>row.inventory_class==='DYNAMIC_REVIEWED').length,
      totalAvailable:rows.length,questions:rows};
  },
  async technicalReferenceOptions(userId:string){
    await reviewerFor(userId);
    return (await query(`SELECT e.entity_id AS chunk_id,e.text,e.content_hash,v.title AS source_title,s.origin,s.license_id,v.version,
      v.id AS document_version_id,s.permission_evidence_hash
      FROM retrieval_entities e JOIN source_chunks c ON c.id=e.entity_id
      JOIN source_document_versions v ON v.id=c.document_version_id JOIN source_documents d ON d.id=v.document_id
      JOIN sources s ON s.id=d.source_id
      WHERE e.purpose='technical-grounding' AND v.quality='technical-reference' AND v.status='published'
        AND v.permission_status='permitted' AND v.review_status='approved' AND v.pii_status='clear' AND v.confidentiality_status='clear'
        AND c.status='active' AND s.state='enabled' AND s.permission_status='permitted' AND s.review_status='approved' AND s.withdrawn_at IS NULL
        AND s.permission_evidence_hash IS NOT NULL
      ORDER BY s.title,v.version,c.chunk_index LIMIT 200`)).rows;
  },
  async addTechnicalReference(userId:string,questionVersionId:string,chunkId:string){
    const reviewer=await reviewerFor(userId);
    if(!uuid.test(questionVersionId)||!uuid.test(chunkId))fail("invalid-id");
    return withDatabaseLock("ingestion:editorial:v1",async()=>{
      const q=(await query("SELECT content_hash,status FROM question_versions WHERE id=$1",[questionVersionId])).rows[0];
      if(!q||q.status!=="published")fail("question-unavailable");
      const ref=(await query(`SELECT v.content_hash,s.permission_evidence_hash,v.quality,v.status,v.permission_status,v.review_status,
        v.pii_status,v.confidentiality_status,s.state,s.withdrawn_at FROM source_chunks c
        JOIN source_document_versions v ON v.id=c.document_version_id JOIN source_documents d ON d.id=v.document_id
        JOIN sources s ON s.id=d.source_id JOIN retrieval_entities e ON e.entity_id=c.id AND e.purpose='technical-grounding'
        WHERE c.id=$1 AND c.status='active' FOR SHARE OF s,v,c`,[chunkId])).rows[0];
      if(!ref||ref.quality!=="technical-reference"||ref.status!=="published"||ref.permission_status!=="permitted"||ref.review_status!=="approved"||
        ref.pii_status!=="clear"||ref.confidentiality_status!=="clear"||ref.state!=="enabled"||ref.withdrawn_at||!ref.permission_evidence_hash)
        fail("technical_reference_unavailable");
      const existing=(await query("SELECT state FROM question_technical_references WHERE question_version_id=$1 AND chunk_id=$2",[questionVersionId,chunkId])).rows[0];
      if(existing?.state==="withdrawn")fail("technical_reference_withdrawn");
      if(!existing){
        const id=randomUUID();
        await query(`INSERT INTO question_technical_references(id,question_version_id,chunk_id,reviewer_id,source_version_hash,permission_hash,state)
          VALUES($1,$2,$3,$4,$5,$6,'approved')`,[id,questionVersionId,chunkId,reviewer.id,ref.content_hash,ref.permission_evidence_hash]);
      }
      await event(questionVersionId,reviewer.id,"approved",q.content_hash,{kind:"technical-reference-added",chunkId,referenceHash:ref.content_hash});
      return {questionVersionId,chunkId,state:"approved"};
    });
  },
  async removeTechnicalReference(userId:string,questionVersionId:string,chunkId:string,reason:string){
    const reviewer=await reviewerFor(userId);
    return withDatabaseLock("ingestion:editorial:v1",async()=>{
      const row=(await query(`UPDATE question_technical_references SET state='withdrawn',withdrawn_at=now()
        WHERE question_version_id=$1 AND chunk_id=$2 AND state='approved' RETURNING id`,[questionVersionId,chunkId])).rows[0];
      if(!row)fail("technical_reference_not_found");
      const q=(await query("SELECT content_hash FROM question_versions WHERE id=$1",[questionVersionId])).rows[0];
      await event(questionVersionId,reviewer.id,"withdrawn",q.content_hash,{kind:"technical-reference-removed",chunkId,reason:reason.slice(0,1000)},reasonCode(reason));
      return {questionVersionId,chunkId,state:"withdrawn"};
    });
  },
  async draftScoringPacket(userId:string,questionVersionId:string,requestId?:string){
    await reviewerFor(userId);
    const q=(await query("SELECT question_text FROM question_versions WHERE id=$1 AND status='published'",[questionVersionId])).rows[0];
    if(!q)fail("question-unavailable");
    const refs=(await query(`SELECT e.entity_id AS id,e.text FROM question_technical_references tr
      JOIN retrieval_entities e ON e.entity_id=tr.chunk_id AND e.purpose='technical-grounding'
      JOIN source_chunks c ON c.id=tr.chunk_id JOIN source_document_versions v ON v.id=c.document_version_id
      JOIN source_documents d ON d.id=v.document_id JOIN sources s ON s.id=d.source_id
      WHERE tr.question_version_id=$1 AND tr.state='approved' AND c.status='active' AND v.status='published'
        AND v.content_hash=tr.source_version_hash AND v.quality='technical-reference' AND v.permission_status='permitted'
        AND v.review_status='approved' AND v.pii_status='clear' AND v.confidentiality_status='clear'
        AND s.state='enabled' AND s.permission_status='permitted' AND s.review_status='approved'
        AND s.permission_evidence_hash=tr.permission_hash AND s.withdrawn_at IS NULL ORDER BY tr.chunk_id LIMIT 10`,[questionVersionId])).rows;
    if(!refs.length)fail("approved_reference_required");
    let result:any;
    try{result=await aiService.draftRubric(q.question_text,refs,requestId) as any;}
    catch(error){
      const code=(error as {code?:unknown})?.code;
      if(["malformed_model_json","rubric_draft_schema_validation_failed","rubric_draft_semantic_validation_failed"].includes(String(code)))fail(String(code));
      if(code==="provider_authentication"||code==="provider_configuration"||code==="provider_model_unavailable")fail("ai-provider-configuration");
      if(code==="provider_rate_limited")fail("ai-provider-rate-limited");
      if(code==="provider_timeout")fail("ai-provider-timeout");
      fail("ai-provider-unavailable");
    }
    const allowed=new Set(refs.map((r:any)=>r.id));
    const content={questionVersionId,concepts:result?.concepts,evidenceIndicators:result?.evidenceIndicators||[],misconceptions:result?.misconceptions||[],
      dimensionGuidance:result?.dimensionGuidance||[],followUpConcepts:result?.followUpConcepts||[],codingObjectiveEvidence:result?.codingObjectiveEvidence??null};
    const grounded=[...(content.concepts||[]),...content.evidenceIndicators,...content.misconceptions,...content.dimensionGuidance,
      ...content.followUpConcepts,...(content.codingObjectiveEvidence?[content.codingObjectiveEvidence]:[])];
    if(!Array.isArray(content.concepts)||grounded.some((item:any)=>!Array.isArray(item.sourceIds)||!item.sourceIds.length||item.sourceIds.some((id:string)=>!allowed.has(id))))fail("invalid_rubric_grounding");
    const draft=await rubricEditor.createDraft(content);
    const reviewer=await reviewerFor(userId);
    await query(`INSERT INTO content_scoring_review_events(id,question_version_id,draft_id,reviewer_id,action,packet_hash)
      VALUES($1,$2,$3,$4,'drafted',$5)`,[randomUUID(),questionVersionId,draft.id,reviewer.id,draft.hash]);
    return {...draft,content:result};
  },
  async approveScoringPacket(userId:string,draftId:string,expectedHash:string){
    const reviewer=await reviewerFor(userId),draft=await rubricEditor.inspect(draftId);
    if(draft.content_hash!==expectedHash||rubricHash(draft.content)!==expectedHash)fail("rubric_hash_mismatch");
    const sourceIds:string[]=[...new Set<string>((draft.content?.concepts||[]).flatMap((concept:any):string[]=>Array.isArray(concept.sourceIds)?concept.sourceIds:[]))];
    const eligible=(await query(`SELECT tr.chunk_id FROM question_technical_references tr JOIN source_chunks c ON c.id=tr.chunk_id
      JOIN source_document_versions v ON v.id=c.document_version_id JOIN source_documents d ON d.id=v.document_id JOIN sources s ON s.id=d.source_id
      WHERE tr.question_version_id=$1 AND tr.state='approved' AND c.status='active' AND v.status='published'
        AND v.content_hash=tr.source_version_hash AND v.quality='technical-reference' AND v.permission_status='permitted'
        AND v.review_status='approved' AND v.pii_status='clear' AND v.confidentiality_status='clear'
        AND s.state='enabled' AND s.permission_status='permitted' AND s.review_status='approved'
        AND s.permission_evidence_hash=tr.permission_hash AND s.withdrawn_at IS NULL`,[draft.question_version_id])).rows;
    if(sourceIds.some((id:string)=>!eligible.some((ref:any)=>ref.chunk_id===id)))fail("technical_reference_unavailable");
    const versionId=await rubricEditor.publish(draftId,expectedHash,reviewer.id);
    await query(`INSERT INTO content_scoring_review_events(id,question_version_id,draft_id,reviewer_id,action,packet_hash)
      VALUES($1,$2,$3,$4,'approved',$5)`,[randomUUID(),draft.question_version_id,draftId,reviewer.id,expectedHash]);
    return {rubricVersionId:versionId,publicationClass:(await query("SELECT publication_class FROM content_question_readiness WHERE question_version_id=$1",[draft.question_version_id])).rows[0]?.publication_class};
  },
  async editScoringPacket(userId:string,draftId:string,expectedHash:string,value:unknown){
    const reviewer=await reviewerFor(userId),draft=await rubricEditor.inspect(draftId);
    if(draft.content_hash!==expectedHash||rubricHash(draft.content)!==expectedHash)fail("rubric_hash_mismatch");
    if(!value||typeof value!=="object"||Array.isArray(value)||(value as any).questionVersionId!==draft.question_version_id)fail("invalid_rubric_draft");
    const available=new Set((await query("SELECT chunk_id FROM question_technical_references WHERE question_version_id=$1 AND state='approved'",[draft.question_version_id])).rows.map(row=>row.chunk_id));
    const concepts=(value as any).concepts;
    if(!Array.isArray(concepts)||concepts.some((concept:any)=>!Array.isArray(concept.sourceIds)||concept.sourceIds.some((id:string)=>!available.has(id))))fail("invalid_rubric_grounding");
    const next=await rubricEditor.createDraft(value);
    await query(`INSERT INTO content_scoring_review_events(id,question_version_id,draft_id,reviewer_id,action,packet_hash,event_metadata)
      VALUES($1,$2,$3,$4,'drafted',$5,$6)`,[randomUUID(),draft.question_version_id,next.id,reviewer.id,next.hash,JSON.stringify({kind:"human-edit",supersedesDraftId:draftId,sourceHash:expectedHash})]);
    return next;
  },
  async rejectScoringPacket(userId:string,draftId:string,expectedHash:string,reason:string){
    const reviewer=await reviewerFor(userId),draft=await rubricEditor.inspect(draftId);
    if(draft.content_hash!==expectedHash||rubricHash(draft.content)!==expectedHash)fail("rubric_hash_mismatch");
    await query(`INSERT INTO content_scoring_review_events(id,question_version_id,draft_id,reviewer_id,action,packet_hash,reason)
      VALUES($1,$2,$3,$4,'rejected',$5,$6)`,[randomUUID(),draft.question_version_id,draftId,reviewer.id,expectedHash,reason.slice(0,1000)]);
    return {draftId,state:"rejected"};
  },
  async withdrawScoringPacket(userId:string,questionVersionId:string,expectedHash:string){
    const reviewer=await reviewerFor(userId);
    return withDatabaseLock("ingestion:editorial:v1",async()=>{
      const rubric=(await query("SELECT id,content_hash FROM rubric_versions WHERE question_version_id=$1 AND content_hash=$2 AND status IN ('reviewed','provisional') ORDER BY version DESC LIMIT 1 FOR UPDATE",[questionVersionId,expectedHash])).rows[0];
      if(!rubric)fail("rubric_hash_mismatch");
      await query("UPDATE rubric_versions SET status='retired' WHERE id=$1",[rubric.id]);
      await query(`INSERT INTO content_scoring_review_events(id,question_version_id,reviewer_id,action,packet_hash,reason)
        VALUES($1,$2,$3,'withdrawn',$4,'reviewer-withdrawn')`,[randomUUID(),questionVersionId,reviewer.id,expectedHash]);
      return {questionVersionId,state:"withdrawn"};
    });
  },
  async publishQuestion(userId:string,candidateId:string,expectedHash:string,embedder?:Embedder){
    await reviewerFor(userId);
    const candidate=await ingestionRepository.inspectCandidate(candidateId);
    if(candidate.contentHash!==expectedHash)fail("review-hash-mismatch");
    const questionVersionId=await ingestionRepository.publishQuestion(candidateId,expectedHash);
    try{await embedCorpus(embedder);}
    catch(error){
      const code=(error as {code?:string})?.code || "embedding_unavailable";
      return {questionVersionId,publicationClass:"approved-not-retrieval-ready",embeddingReady:false,errorCode:code};
    }
    const status=(await query("SELECT publication_class FROM content_question_readiness WHERE question_version_id=$1",[questionVersionId])).rows[0];
    return {questionVersionId,publicationClass:status?.publication_class || "approved-not-retrieval-ready",embeddingReady:true};
  },
  async seedReview(userId:string){
    await reviewerFor(userId);
    return (await query(`SELECT q.id AS question_version_id,q.question_text,q.content_hash,q.category,q.difficulty,c.id AS candidate_id,
      true AS is_seed,EXISTS(SELECT 1 FROM seed_question_review_approvals a JOIN candidate_ai_review_packets p
        ON p.candidate_id=a.candidate_id AND p.content_hash=a.content_hash AND p.packet_hash=a.ai_packet_hash
        WHERE a.candidate_id=c.id AND a.question_version_id=q.id AND a.content_hash=c.content_hash AND a.action='approved'
          AND p.version=(SELECT max(latest.version) FROM candidate_ai_review_packets latest WHERE latest.candidate_id=c.id AND latest.content_hash=c.content_hash)) AS seed_question_approved,
      ready.publication_class,COALESCE((SELECT count(*)::int FROM question_technical_references tr
        WHERE tr.question_version_id=q.id AND tr.state='approved'),0) AS reviewed_reference_count,
      (SELECT rv.content_hash FROM rubric_versions rv WHERE rv.question_version_id=q.id ORDER BY rv.version DESC LIMIT 1) AS scoring_packet_hash,
      (SELECT jsonb_build_object('id',p.id,'version',p.version,'hash',p.packet_hash,'createdAt',p.created_at,'packet',p.packet)
        FROM candidate_ai_review_packets p WHERE p.candidate_id=c.id AND p.content_hash=c.content_hash ORDER BY p.version DESC LIMIT 1) AS ai_review
      FROM question_versions q JOIN content_question_readiness ready ON ready.question_version_id=q.id
      JOIN ingestion_candidates c ON c.question_version_id=q.id AND c.state='published'
      WHERE q.status='published' AND EXISTS(SELECT 1 FROM ingestion_candidates c JOIN ingestion_records r ON r.id=c.record_id
        JOIN sources s ON s.id=r.source_id WHERE c.question_version_id=q.id AND c.state='published' AND r.state='published'
          AND r.input_hash=$1 AND s.source_type='authored')
      ORDER BY q.version,q.id LIMIT 48`,[REVIEWED_SEED_INPUT_HASH])).rows;
  },
  async approveSeedQuestion(userId:string,candidateId:string,expectedHash:string,expectedPacketHash:string){
    const reviewer=await reviewerFor(userId);
    if(!uuid.test(candidateId)||! /^[a-f0-9]{64}$/.test(expectedHash)||! /^[a-f0-9]{64}$/.test(expectedPacketHash))fail("invalid-id");
    return withDatabaseLock(`seed-question-review:${candidateId}`,async()=>{
      const item=(await query(`SELECT c.id,c.state,c.content_hash,c.question_version_id,r.id AS record_id,r.source_id,r.input_hash,
        s.stable_key,p.packet_hash,p.version FROM ingestion_candidates c JOIN ingestion_records r ON r.id=c.record_id
        JOIN sources s ON s.id=r.source_id LEFT JOIN candidate_ai_review_packets p ON p.candidate_id=c.id AND p.content_hash=c.content_hash
        WHERE c.id=$1 ORDER BY p.version DESC NULLS LAST LIMIT 1 FOR UPDATE OF c,r,s`,[candidateId])).rows[0];
      if(!item||item.input_hash!==REVIEWED_SEED_INPUT_HASH||!['techvera-junior-se-v1','techvera-junior-se-seed-v1'].includes(item.stable_key))fail("seed-question-not-found");
      if(item.content_hash!==expectedHash)fail("review-hash-mismatch");
      if(item.state!=="published"||!item.question_version_id)fail("candidate-not-reviewable");
      if(!item.packet_hash)fail("seed-ai-review-required");
      if(item.packet_hash!==expectedPacketHash)fail("review-hash-mismatch");
      await query(`INSERT INTO seed_question_review_approvals(id,candidate_id,question_version_id,content_hash,ai_packet_hash,reviewer_id,action)
        VALUES($1,$2,$3,$4,$5,$6,'approved')`,[randomUUID(),candidateId,item.question_version_id,expectedHash,expectedPacketHash,reviewer.id]);
      await query(`INSERT INTO ingestion_review_events(id,source_id,record_id,candidate_id,reviewer_id,action,content_hash,reason_code,event_metadata)
        VALUES($1,$2,$3,$4,$5,'seed-question-approved',$6,'human-approved-ai-proposal',$7)`,[randomUUID(),item.source_id,item.record_id,candidateId,reviewer.id,expectedHash,JSON.stringify({aiPacketHash:expectedPacketHash,aiApproved:false})]);
      const readiness=(await query("SELECT publication_class FROM content_question_readiness WHERE question_version_id=$1",[item.question_version_id])).rows[0];
      return {candidateId,questionVersionId:item.question_version_id,contentHash:expectedHash,aiPacketHash:expectedPacketHash,
        questionApproved:true,publicationClass:readiness?.publication_class||"approved-not-retrieval-ready"};
    });
  },
};
