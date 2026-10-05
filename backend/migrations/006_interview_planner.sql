-- Additive Phase 6 planner snapshots. Applied migrations 001-005 remain unchanged.
ALTER TABLE interview_plans ADD COLUMN setup_snapshot knowledge_json NOT NULL DEFAULT '{}';
ALTER TABLE interview_plans ADD COLUMN confirmed_at TIMESTAMPTZ;
ALTER TABLE interview_plans ADD COLUMN creation_transaction xid8 NOT NULL DEFAULT pg_current_xact_id();
ALTER TABLE plan_items ADD COLUMN provenance_refs knowledge_json NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(provenance_refs)='array');
ALTER TABLE sessions ADD COLUMN interview_plan_id UUID;
ALTER TABLE sessions ADD CONSTRAINT session_owned_plan FOREIGN KEY(interview_plan_id,id,user_id)
  REFERENCES interview_plans(id,session_id,user_id) ON DELETE SET NULL (interview_plan_id);
CREATE UNIQUE INDEX uq_session_interview_plan ON sessions(interview_plan_id) WHERE interview_plan_id IS NOT NULL;

CREATE FUNCTION protect_planner_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.contract_version='planner-v1' AND OLD.creation_transaction<>pg_current_xact_id() AND ((to_jsonb(NEW)-ARRAY['status','revision','confirmed_at'])
    IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','revision','confirmed_at']) OR NEW.revision<OLD.revision) THEN
    RAISE EXCEPTION 'Planner snapshot is immutable; preview a new plan' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER planner_snapshot_immutable BEFORE UPDATE ON interview_plans FOR EACH ROW EXECUTE FUNCTION protect_planner_snapshot();

CREATE FUNCTION protect_planner_item() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p interview_plans; hit retrieval_results;
BEGIN
  SELECT * INTO p FROM interview_plans WHERE id=CASE WHEN TG_OP='INSERT' THEN NEW.plan_id ELSE OLD.plan_id END;
  IF NOT FOUND OR p.contract_version<>'planner-v1' THEN RETURN coalesce(NEW,OLD); END IF;
  IF TG_OP<>'INSERT' OR p.creation_transaction<>pg_current_xact_id() THEN
    RAISE EXCEPTION 'Planner items are immutable; preview a new plan' USING ERRCODE='23514';
  END IF;
  SELECT r.* INTO hit FROM retrieval_results r JOIN retrieval_evidence e ON e.id=r.retrieval_id
    WHERE r.retrieval_id=NEW.retrieval_id AND r.question_version_id=NEW.question_version_id AND r.selected
      AND e.user_id=NEW.user_id AND e.session_id=NEW.session_id AND e.corpus_version=p.corpus_version AND e.outcome='success';
  IF NOT FOUND OR NEW.provenance_refs<>hit.provenance_snapshot OR jsonb_array_length(NEW.provenance_refs)=0 THEN
    RAISE EXCEPTION 'Plan item requires actual compatible owned retrieval evidence' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM retrieval_entities e JOIN embedding_metadata m ON m.question_version_id=e.entity_id
      JOIN embedding_vectors v ON v.metadata_id=m.id JOIN embedding_generations g ON g.id=m.corpus_generation
      WHERE e.entity_id=NEW.question_version_id AND e.purpose='question-selection' AND m.status='active'
        AND g.status='active' AND g.id=p.corpus_version AND m.content_hash=e.content_hash
        AND NEW.provenance_refs @> e.provenance AND e.provenance @> NEW.provenance_refs) THEN
    RAISE EXCEPTION 'Plan item is unavailable or stale' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER planner_item_immutable BEFORE INSERT OR UPDATE OR DELETE ON plan_items FOR EACH ROW EXECUTE FUNCTION protect_planner_item();

CREATE FUNCTION validate_planner_invariants() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p interview_plans; target UUID; n integer; roots integer; minutes numeric; actual jsonb; distribution jsonb;
BEGIN
  IF TG_TABLE_NAME='interview_plans' THEN target:=coalesce(NEW.id,OLD.id);
  ELSE target:=coalesce(NEW.plan_id,OLD.plan_id); END IF;
  SELECT * INTO p FROM interview_plans WHERE id=target;
  IF NOT FOUND OR p.contract_version<>'planner-v1' OR p.status NOT IN ('ready','active') THEN RETURN NULL; END IF;
  SELECT count(*),coalesce(sum(estimated_minutes),0),jsonb_build_object(
      'easy',count(*) FILTER(WHERE difficulty='easy'),'standard',count(*) FILTER(WHERE difficulty='standard'),
      'stretch',count(*) FILTER(WHERE difficulty='stretch')) INTO n,minutes,distribution FROM plan_items WHERE plan_id=p.id AND parent_item_id IS NULL;
  SELECT count(*) INTO roots FROM plan_competencies WHERE plan_id=p.id;
  SELECT jsonb_object_agg(competency_id,total) INTO actual FROM (
    SELECT c.competency_id,count(i.id) AS total FROM plan_competencies c LEFT JOIN plan_items i ON i.plan_id=c.plan_id
      AND split_part(i.primary_competency,'.',1)=c.competency_id AND i.parent_item_id IS NULL
      WHERE c.plan_id=p.id GROUP BY c.competency_id) counts;
  IF p.planner_version<>'deterministic-v1' OR roots NOT BETWEEN 1 AND 4 OR n<>p.effective_count OR n<roots
    OR p.requested_count NOT BETWEEN 3 AND 10 OR p.requested_minutes NOT BETWEEN 15 AND 60
    OR p.coverage<>actual OR EXISTS(SELECT 1 FROM jsonb_each(actual) e WHERE e.value::text::int<1)
    OR p.difficulty_distribution<>distribution OR p.effective_minutes<>minutes+6
    OR p.effective_minutes>p.requested_minutes OR NOT p.time_budget ?& ARRAY['setupWrapMinutes','probeReserveMinutes','questionMinutes','totalMinutes','slackMinutes']
    OR p.time_budget->>'setupWrapMinutes'<>'2' OR p.time_budget->>'probeReserveMinutes'<>'4'
    OR (p.time_budget->>'questionMinutes')::numeric<>minutes OR (p.time_budget->>'totalMinutes')::numeric<>p.effective_minutes
    OR (p.time_budget->>'slackMinutes')::numeric<>p.requested_minutes-p.effective_minutes
    OR n<>(SELECT count(DISTINCT q.question_id) FROM plan_items i JOIN question_versions q ON q.id=i.question_version_id WHERE i.plan_id=p.id)
    OR n<>(SELECT count(DISTINCT v.duplicate_group) FROM plan_items i JOIN embedding_metadata m ON m.question_version_id=i.question_version_id
      JOIN embedding_vectors v ON v.metadata_id=m.id WHERE i.plan_id=p.id AND m.status='active' AND m.corpus_generation=p.corpus_version)
    OR (p.mode='mixed' AND (NOT EXISTS(SELECT 1 FROM plan_items WHERE plan_id=p.id AND category IN ('coding','sql'))
      OR NOT EXISTS(SELECT 1 FROM plan_items WHERE plan_id=p.id AND category NOT IN ('coding','sql'))))
    OR (SELECT count(*) FROM plan_items WHERE plan_id=p.id AND category='system-design-lite')>1
    OR EXISTS(SELECT 1 FROM plan_items i WHERE i.plan_id=p.id AND (i.parent_item_id IS NOT NULL OR i.position>=n
      OR i.estimated_minutes<>CASE WHEN i.category IN ('coding','system-design-lite') THEN 8 WHEN i.category='sql' THEN 5 ELSE 3 END
      OR (p.mode='oral' AND i.category NOT IN ('conceptual-oral','scenario','debugging'))
      OR (p.mode='coding' AND i.category NOT IN ('coding','sql'))
      OR (i.category='system-design-lite' AND NOT coalesce((p.modifiers->>'designLite')::boolean,false))
      OR NOT EXISTS(SELECT 1 FROM plan_competencies c WHERE c.plan_id=p.id AND c.competency_id=split_part(i.primary_competency,'.',1)))) THEN
    RAISE EXCEPTION 'Planner coverage/count/difficulty/time/identity invariants failed' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER planner_plan_invariants AFTER INSERT OR UPDATE ON interview_plans DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_planner_invariants();
CREATE CONSTRAINT TRIGGER planner_item_invariants AFTER INSERT OR UPDATE OR DELETE ON plan_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_planner_invariants();
CREATE CONSTRAINT TRIGGER planner_coverage_invariants AFTER INSERT OR UPDATE OR DELETE ON plan_competencies DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_planner_invariants();
