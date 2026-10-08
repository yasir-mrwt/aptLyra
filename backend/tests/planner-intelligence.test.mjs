import test from 'node:test';
import assert from 'node:assert/strict';
const {validateSetup,estimateMinutes}=await import('../dist/planner/contracts.js');
const {allocate}=await import('../dist/planner/allocate.js');
const base={role:'Software Engineer',level:'junior',taxonomyVersion:'junior-se-v1',competencies:['dsa','programming'],difficulty:'standard',mode:'oral',count:5,minutes:45,language:'en',codeLanguage:'javascript',modifiers:{}};
const candidate=(root,index,publicationClass='reviewed/scoring-ready')=>({root,group:`${root}-${index}`,publicationClass,reason:publicationClass==='fresh/provisional'?'recent_signal':'core_reviewed',minutes:estimateMinutes('conceptual-oral'),hit:{questionVersionId:`${root}-${index}`,familyKey:`${root}-${index}`,difficulty:'standard',category:'conceptual-oral',similarity:0.9}});
test('recent planner modifier is opt-in and bounds provisional items to a minority without losing root coverage',()=>{
 assert.equal(validateSetup(base).includeRecentTrends,false);
 const setup=validateSetup({...base,includeRecentTrends:true});
 const candidates=['dsa','programming'].flatMap(root=>[candidate(root,1),candidate(root,2,'fresh/provisional'),candidate(root,3,'fresh/provisional'),candidate(root,4)]);
 const result=allocate(setup,candidates);
 assert.equal(result.items.length,5);assert.ok(result.items.every(item=>result.coverage[item.root]>0));
 assert.ok(result.items.filter(item=>item.publicationClass==='fresh/provisional').length<=1);
 const core=allocate(validateSetup(base),candidates.filter(item=>item.publicationClass!=='fresh/provisional'));
 assert.equal(core.items.length,4);assert.ok(core.items.every(item=>item.publicationClass==='reviewed/scoring-ready'));assert.ok(core.shortages.includes('count_reduced_for_time_or_evidence'));
});
