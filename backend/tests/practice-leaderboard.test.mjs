import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildPracticeLeaderboard} from '../dist/services/practiceLeaderboard.js';
const questions=(score=80)=>[0,1,2].map(n=>({questionVersionId:`question-${n}`,questionType:'oral',language:'javascript',isEvaluated:true,isSubmitted:true,evaluation:{rubricVersionId:`rubric-${n}`,rubricStatus:'reviewed',status:'scored',technicalScore:score,evaluatorConfidence:'high',scoringVersion:'technical-v1'}}));
const record=(id,score=80,date='2026-10-17T00:00:00.000Z')=>({userId:id,sessionId:`session-${id}-${date}`,name:`Alias ${id}`,role:'Backend Developer',completedAt:date,questions:questions(score)});
test('only fully reviewed comparable results qualify; exact versions separate groups',()=>{
 const good=record('a'),provisional=record('b'),low=record('c'),unanswered=record('d'),different=record('e');
 provisional.questions[0].evaluation.rubricStatus='provisional';low.questions[0].evaluation.evaluatorConfidence='low';unanswered.questions[0].isEvaluated=false;different.questions[0].evaluation.rubricVersionId='new-version';
 const groups=buildPracticeLeaderboard([good,provisional,low,unanswered,different],'a');
 assert.equal(groups.length,2);assert.equal(groups.reduce((n,g)=>n+g.participants,0),2);
 assert.ok(groups.some(g=>g.entries.some(e=>e.self)));
 assert.ok(groups.every(g=>g.entries.every(e=>!('userId'in e)&&!('sessionId'in e))));
});
test('latest per person wins, not best; ties share competition rank and do not fabricate zero',()=>{
 const groups=buildPracticeLeaderboard([record('a',100,'2026-10-01T00:00:00.000Z'),record('a',80),record('b',80),record('c',60)],'a');
 assert.deepEqual(groups[0].entries.map(e=>[e.rank,e.mean]),[[1,80],[1,80],[3,60]]);
 const invalid=record('d');invalid.questions[0].evaluation.technicalScore=null;
 assert.deepEqual(buildPracticeLeaderboard([invalid],'d'),[]);
});
