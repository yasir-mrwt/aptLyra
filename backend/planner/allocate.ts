import { adjacent, isCode, PlannerError, type Setup, type Candidate, type Allocation } from "./contracts.js";

/** Bounded constraint search: minimize repeats before tie-breaking, preserve topic/difficulty allocation. */
export function allocate(setup: Setup, candidates: Candidate[]): Allocation {
  candidates=candidates.filter(c=>setup.repeatPolicy!=="only-new" || !c.history?.count);
  const overhead=6, usable=setup.minutes-overhead;
  const pools=new Map(setup.competencies.map(root=>[root,candidates.filter(c=>c.root===root)]));
  const missing=setup.competencies.filter(root=>!pools.get(root)?.length);
  let nodes=0;
  const find=(count: number, strictDifficulty: boolean, repeatBudget=count): Candidate[] | null => {
    const target=Math.round(count*0.6), adj=adjacent(setup.difficulty);
    if(setup.mode==="mixed" && (!candidates.some(c=>isCode(c.hit.category!)) || !candidates.some(c=>!isCode(c.hit.category!))))return null;
    let minimumRequested=0,maximumRequested=0;
    for(const root of setup.competencies) {
      const slots=Array.from({length:count},(_,i)=>setup.competencies[i%setup.competencies.length]).filter(r=>r===root).length;
      const pool=pools.get(root)!;
      if(new Set(pool.map(c=>c.group)).size<slots)return null;
      minimumRequested+=Math.max(0,slots-new Set(pool.filter(c=>c.hit.difficulty===adj).map(c=>c.group)).size);
      maximumRequested+=Math.min(slots,new Set(pool.filter(c=>c.hit.difficulty===setup.difficulty).map(c=>c.group)).size);
    }
    if(strictDifficulty && (target<minimumRequested || target>maximumRequested))return null;
    const failed=new Set<string>();
    const visit=(items: Candidate[], minutes: number, requested: number, hasCode: boolean, hasOral: boolean): Candidate[] | null => {
      const state=items.map(c=>c.hit.questionVersionId).sort().join("|");
      if(failed.has(state))return null;
      if(++nodes>50000)throw new PlannerError("planning_budget_exceeded",503);
      const repeats=items.filter(c=>c.history?.count).length;
      if(repeats>repeatBudget)return null;
      if(items.length===count)return (!strictDifficulty || requested===target)
        && (setup.mode!=="mixed" || hasCode && hasOral)?items:null;
      // Admissible fresh-capacity bound, grouped per root. Shared families can only reduce capacity.
      let minimumRepeats=0;
      for(const root of setup.competencies) {
        const slots=Array.from({length:count-items.length},(_,i)=>setup.competencies[(items.length+i)%setup.competencies.length]).filter(r=>r===root).length;
        const freshGroups=new Set(pools.get(root)!.filter(c=>!c.history?.count && !items.some(i=>i.group===c.group || i.hit.familyKey && i.hit.familyKey===c.hit.familyKey)).map(c=>c.group));
        minimumRepeats+=Math.max(0,slots-freshGroups.size);
      }
      if(repeats+minimumRepeats>repeatBudget)return null;
      const root=setup.competencies[items.length%setup.competencies.length];
      const groups=new Set(items.map(c=>c.group)), families=new Set(items.map(c=>c.hit.familyKey));
      const desired=Math.round((items.length+1)*0.6)>Math.round(items.length*0.6)?setup.difficulty:adj;
      const pool=[...pools.get(root)!].sort((a,b)=>(setup.repeatPolicy!=="revision" && a.history?.count && b.history?.count? a.history.lastAssigned-b.history.lastAssigned || a.history.count-b.history.count:0) || (b.history?.priority ?? 0)-(a.history?.priority ?? 0) || Number(b.hit.difficulty===desired)-Number(a.hit.difficulty===desired)
        || Number(a.inventoryClass==="DYNAMIC_PROVISIONAL")-Number(b.inventoryClass==="DYNAMIC_PROVISIONAL")
        || ["core_reviewed","filtered_retrieval","difficulty","adjacent_difficulty","coverage","reviewed_seed","fallback","approved_template","recent_signal"].indexOf(a.reason)
          -["core_reviewed","filtered_retrieval","difficulty","adjacent_difficulty","coverage","reviewed_seed","fallback","approved_template","recent_signal"].indexOf(b.reason)
        || a.minutes-b.minutes || (b.hit.similarity ?? 0)-(a.hit.similarity ?? 0)
        || a.hit.questionVersionId!.localeCompare(b.hit.questionVersionId!));
      for(const c of pool) {
        if(groups.has(c.group) || c.hit.familyKey && families.has(c.hit.familyKey) || c.history?.keys.some(k=>items.some(i=>i.history?.keys.includes(k))) || minutes+c.minutes>usable
          || (c.hit.category==="system-design-lite" && items.some(i=>i.hit.category==="system-design-lite")))continue;
        const nextRequested=requested+Number(c.hit.difficulty===setup.difficulty);
        if(strictDifficulty && (nextRequested>target || c.hit.difficulty!==setup.difficulty && c.hit.difficulty!==adj
          || nextRequested+count-items.length-1<target))continue;
        // Cheap admissible lower bound; don't drop coverage to fit the time budget.
        let lower=0;
        for(let pos=items.length+1;pos<count;pos++)lower+=Math.min(...pools.get(setup.competencies[pos%setup.competencies.length])!.map(x=>x.minutes));
        if(minutes+c.minutes+lower>usable)continue;
        const found=visit([...items,c],minutes+c.minutes,nextRequested,hasCode || isCode(c.hit.category!),hasOral || !isCode(c.hit.category!));
        if(found)return found;
      }
      failed.add(state);
      return null;
    };
    return visit([],0,0,false,false);
  };
  let items: Candidate[]=[];
  if(!missing.length)for(let count=setup.count;count>=setup.competencies.length;count--) {
    let found:Candidate[]|null=null;
    for(const strict of [true,false]) {
      const minimize=setup.repeatPolicy!=="revision";
      for(let repeats=minimize?0:count;repeats<=count;repeats++) {
        found=find(count,strict,repeats);if(found)break;
      }
      if(found)break;
    }
    if(found){items=found;break;}
  }
  const coverage=Object.fromEntries(setup.competencies.map(root=>[root,items.filter(c=>c.root===root).length]));
  const difficultyDistribution={easy:0,standard:0,stretch:0};
  for(const c of items)difficultyDistribution[c.hit.difficulty!]++;
  const questionMinutes=items.reduce((sum,c)=>sum+c.minutes,0), totalMinutes=overhead+questionMinutes;
  const shortages:string[]=[];
  if(setup.repeatPolicy==="only-new" && items.length<setup.count)shortages.push(`only_new_shortage:${items.length}:${setup.count}`);
  if(setup.repeatPolicy==="revision" && !items.some(c=>c.history?.count))shortages.push("revision_fresh_fallback");
  if(missing.length)shortages.push("competency_evidence_shortage:"+missing.join(","));
  else if(!items.length)shortages.push("time_or_mode_coverage_shortage");
  if(setup.repeatPolicy!=="only-new" && items.length && items.length<setup.count)shortages.push("count_reduced_for_time_or_evidence");
  if(items.length && difficultyDistribution[setup.difficulty]!==Math.round(items.length*0.6))shortages.push("difficulty_target_shortage");
  if(items.some(c=>c.reason==="reviewed_seed" || c.reason==="approved_template"))shortages.push("reviewed_fallback_used");
  if(setup.includeRecentTrends&&items.some(c=>c.inventoryClass==="DYNAMIC_PROVISIONAL"))shortages.push("recent_signal_provisional_selected");
  if(setup.modifiers.company || setup.modifiers.occurredAfter || setup.modifiers.occurredBefore)
    if(!items.length)shortages.push("company_date_evidence_unavailable_constraints_preserved");
  return {items,coverage,difficultyDistribution,timeBudget:{setupWrapMinutes:2,probeReserveMinutes:4,questionMinutes,slackMinutes:setup.minutes-totalMinutes,totalMinutes},
    shortages,canConfirm:(setup.repeatPolicy!=="only-new" || items.length===setup.count) && items.length>0 && Object.values(coverage).every(n=>n>0)};
}
