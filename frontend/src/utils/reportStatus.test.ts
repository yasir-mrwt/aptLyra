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
