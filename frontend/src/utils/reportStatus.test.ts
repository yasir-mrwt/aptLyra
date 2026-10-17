import {describe,it,expect} from "vitest";
import {evaluationStatus,executionStatus} from "./reportStatus";
import type {Question} from "../types/session";
describe("report status",()=>{
 it("does not call a completed oral answer pending execution",()=>{
 const q={questionType:"oral",isSubmitted:true,isEvaluated:true} as Question;
 expect(evaluationStatus(q)).toContain("Evaluation complete");expect(executionStatus(q)).toContain("not applicable");
 });
 it("distinguishes pending, unavailable and not run",()=>{
 expect(evaluationStatus({isSubmitted:true} as Question)).toBe("Evaluation pending");
 expect(executionStatus({questionType:"coding"} as Question)).toBe("Execution tests unavailable");
 expect(executionStatus({questionType:"coding",executionTestId:"binary-search-v1"} as Question)).toBe("Execution not run");
 });
});

import {individualPractice} from './reportStatus';
it('averages only actual numeric results without converting withheld scores to zero',()=>{
 const questions=[{isEvaluated:true,technicalScore:80},{isEvaluated:true,technicalScore:0},{isEvaluated:true,evaluation:{status:'abstained',technicalScore:null,reasons:['practice_without_reviewed_scoring']}},{isEvaluated:false}] as Question[];
 expect(individualPractice(questions)).toEqual({mean:40,scored:2,total:4,provisional:1,missing:1});
 expect(individualPractice([]).mean).toBeNull();
});
