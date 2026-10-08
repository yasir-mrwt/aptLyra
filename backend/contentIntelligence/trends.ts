import { query } from "../config/db.js";
import { contentSubmissions } from "./submissions.js";

const windows=new Set([30,90,180]);
export const contentTrends={
  async list(userId:string,days:number,role?:string,company?:string){
    if(!await contentSubmissions.reviewerFor(userId))throw new Error("reviewer-not-authorized");
    if(!windows.has(days)|| (role&& !["Software Engineer","Backend Developer","Full Stack Developer"].includes(role))|| (company&&company.length>200))throw new Error("invalid_trend_filters");
    const rows=(await query(`SELECT r.id AS record_id,s.id AS source_id,s.source_type,v.content_hash,e.company_label,e.role,e.occurred_on,e.round_type,e.topics,
        CASE WHEN e.occurred_on IS NOT NULL THEN e.occurred_on::timestamptz ELSE r.created_at END AS signal_at,
        (e.occurred_on IS NOT NULL) AS occurrence_known,
        COALESCE((SELECT jsonb_agg(DISTINCT jsonb_build_object('family',iq.family_key,'competency',q.primary_competency,'category',q.category))
          FROM ingestion_candidates c JOIN question_versions q ON q.id=c.question_version_id JOIN interview_questions iq ON iq.id=q.question_id
          WHERE c.record_id=r.id AND c.state='published' AND q.status='published'),'[]'::jsonb) AS questions
      FROM ingestion_records r JOIN sources s ON s.id=r.source_id JOIN source_document_versions v ON v.id=r.document_version_id
      JOIN interview_experience_records e ON e.document_version_id=v.id
      WHERE r.state='published' AND v.status='published' AND v.review_status='approved' AND v.pii_status IN ('clear','redacted') AND v.confidentiality_status='clear'
        AND s.state='enabled' AND s.withdrawn_at IS NULL AND (s.permission_expires_at IS NULL OR s.permission_expires_at>now()) AND s.permission_status='permitted' AND s.review_status='approved'
        AND COALESCE(e.occurred_on::timestamptz,r.created_at)>=now()-($1*interval '1 day')
        AND ($2::text IS NULL OR e.role=$2) AND ($3::text IS NULL OR e.company_label=$3)
      ORDER BY signal_at DESC LIMIT 1000`,[days,role||null,company||null])).rows;
    const groups=new Map<string,any>();
    for(const row of rows){
      const topics=Array.isArray(row.topics)?row.topics:[];
      const dimensions=topics.length?topics.map((topic:string)=>({topic,competency:null,family:null,category:null})):[];
      for(const q of Array.isArray(row.questions)?row.questions:[])dimensions.push({topic:q.competency,competency:q.competency,family:q.family,category:q.category});
      for(const d of dimensions){if(!d.topic)continue;const key=[d.topic,row.role,row.company_label||"",row.round_type||"",days].join("|");let g=groups.get(key);if(!g){g={topic:d.topic,competency:d.competency,role:row.role,company:row.company_label||null,round:row.round_type||null,windowDays:days,records:new Set(),sources:new Set(),families:new Set(),occurrenceKnown:0,reportedDateOnly:0,latest:row.signal_at,score:0};groups.set(key,g);}
        const hash=String(row.content_hash);if(g.records.has(hash))continue;g.records.add(hash);g.sources.add(row.source_id);if(d.family)g.families.add(d.family);
        const reliable=Boolean(row.occurrence_known);if(reliable)g.occurrenceKnown++;else g.reportedDateOnly++;
        const ageDays=Math.max(0,(Date.now()-new Date(row.signal_at).getTime())/86_400_000);g.score+=Math.exp(-ageDays/(days/2))*(reliable?1:0.65);
      }
    }
    return [...groups.values()].map(g=>{const records=g.records.size,sourceCount=g.sources.size,families=g.families.size;const label=records>=3&&sourceCount>=2?"Frequently reported recently":records<=2&&days===30?"Emerging topic":"Recently reported";
      return {topic:g.topic,competency:g.competency,role:g.role,company:g.company,round:g.round,windowDays:g.windowDays,distinctRecords:records,independentSources:sourceCount,questionFamilies:families,
        trendLabel:label,latestReportedAt:g.latest,trendStrength:Number(g.score.toFixed(3)),metadataConfidence:g.occurrenceKnown>g.reportedDateOnly?"occurrence-supported":"report-date-lower-confidence",
        evidenceRecordHashes:[...g.records].slice(0,50)};}).sort((a,b)=>b.distinctRecords-a.distinctRecords||a.topic.localeCompare(b.topic));
  },
};
