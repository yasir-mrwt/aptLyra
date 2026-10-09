import { adjacent, isCode, PlannerError, type Setup, type Candidate, type Allocation } from "./contracts.js";

/** Pure bounded deterministic search. Reduce count while retaining every requested root. */
export function allocate(setup: Setup, candidates: Candidate[]): Allocation {
  const overhead=6, usable=setup.minutes-overhead;
  const pools=new Map(setup.competencies.map(root=>[root,candidates.filter(c=>c.root===root)]));
  const missing=setup.competencies.filter(root=>!pools.get(root)?.length);
  let nodes=0;
  const find=(count: number, strictDifficulty: boolean): Candidate[] | null => {
    const target=Math.round(count*0.6), adj=adjacent(setup.difficulty);
    const recentLimit=setup.includeRecentTrends?Math.floor(count*0.3):0;
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
    const visit=(items: Candidate[], minutes: number, requested: number, hasCode: boolean, hasOral: boolean): Candidate[] | null => {
      if(++nodes>50000)throw new PlannerError("planning_budget_exceeded",503);
      if(items.length===count)return (!strictDifficulty || requested===target)
        && (setup.mode!=="mixed" || hasCode && hasOral)?items:null;
      const root=setup.competencies[items.length%setup.competencies.length];
      const groups=new Set(items.map(c=>c.group)), families=new Set(items.map(c=>c.hit.familyKey));
      const desired=Math.round((items.length+1)*0.6)>Math.round(items.length*0.6)?setup.difficulty:adj;
      const pool=[...pools.get(root)!].sort((a,b)=>Number(b.hit.difficulty===desired)-Number(a.hit.difficulty===desired)
        || Number(a.inventoryClass==="DYNAMIC_PROVISIONAL")-Number(b.inventoryClass==="DYNAMIC_PROVISIONAL")
        || ["core_reviewed","filtered_retrieval","difficulty","adjacent_difficulty","coverage","reviewed_seed","fallback","approved_template","recent_signal"].indexOf(a.reason)
          -["core_reviewed","filtered_retrieval","difficulty","adjacent_difficulty","coverage","reviewed_seed","fallback","approved_template","recent_signal"].indexOf(b.reason)
        || a.minutes-b.minutes || (b.hit.similarity ?? 0)-(a.hit.similarity ?? 0)
        || a.hit.questionVersionId!.localeCompare(b.hit.questionVersionId!));
      for(const c of pool) {
        if(groups.has(c.group) || families.has(c.hit.familyKey) || minutes+c.minutes>usable
          || (c.inventoryClass==="DYNAMIC_PROVISIONAL"&&items.filter(i=>i.inventoryClass==="DYNAMIC_PROVISIONAL").length>=recentLimit)
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
      return null;
    };
    return visit([],0,0,false,false);
  };
  let items: Candidate[]=[];
  if(!missing.length)for(let count=setup.count;count>=setup.competencies.length;count--) {
    const found=find(count,true) || find(count,false);
    if(found){items=found;break;}
  }
  const coverage=Object.fromEntries(setup.competencies.map(root=>[root,items.filter(c=>c.root===root).length]));
  const difficultyDistribution={easy:0,standard:0,stretch:0};
  for(const c of items)difficultyDistribution[c.hit.difficulty!]++;
  const questionMinutes=items.reduce((sum,c)=>sum+c.minutes,0), totalMinutes=overhead+questionMinutes;
  const shortages:string[]=[];
  if(missing.length)shortages.push("competency_evidence_shortage:"+missing.join(","));
  else if(!items.length)shortages.push("time_or_mode_coverage_shortage");
  if(items.length && items.length<setup.count)shortages.push("count_reduced_for_time_or_evidence");
  if(items.length && difficultyDistribution[setup.difficulty]!==Math.round(items.length*0.6))shortages.push("difficulty_target_shortage");
  if(items.some(c=>c.reason==="reviewed_seed" || c.reason==="approved_template"))shortages.push("reviewed_fallback_used");
  if(setup.includeRecentTrends&&items.some(c=>c.inventoryClass==="DYNAMIC_PROVISIONAL"))shortages.push("recent_signal_provisional_selected");
  if(setup.includeRecentTrends&&candidates.some(c=>c.inventoryClass==="DYNAMIC_PROVISIONAL")&&!items.some(c=>c.inventoryClass==="DYNAMIC_PROVISIONAL"))shortages.push("recent_signal_not_selected_within_30_percent_cap");
  if(setup.modifiers.company || setup.modifiers.occurredAfter || setup.modifiers.occurredBefore)
    if(!items.length)shortages.push("company_date_evidence_unavailable_constraints_preserved");
  return {items,coverage,difficultyDistribution,timeBudget:{setupWrapMinutes:2,probeReserveMinutes:4,questionMinutes,slackMinutes:setup.minutes-totalMinutes,totalMinutes},
    shortages,canConfirm:items.length>0 && Object.values(coverage).every(n=>n>0)};
}
