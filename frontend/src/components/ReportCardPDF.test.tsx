// @vitest-environment node
import {it,expect} from "vitest";
import {renderToBuffer} from "@react-pdf/renderer";
import ReportCardPDF from "./ReportCardPDF";
import type {Session} from "../types/session";
it("renders long code, explanation and feedback across multiple PDF pages",async()=>{
 const session={_id:"export-fixture",role:"Software Engineer",level:"Junior",status:"completed",endTime:"2026-10-12T12:00:00Z",questions:[{questionText:"Explain and implement binary search",questionType:"coding",isEvaluated:true,userSubmittedCode:Array.from({length:150},(_,i)=>`    # Indented line ${i}: ${"x".repeat(120)}`).join("\n"),userAnswerText:"Approach, complexity and tradeoffs. ".repeat(300),aiFeedback:"Review feedback. ".repeat(300),technicalScore:80}]} as Session;
 const buffer=await renderToBuffer(<ReportCardPDF session={session}/>);
 const raw=buffer.toString("latin1");
 expect(raw.startsWith("%PDF")).toBe(true);
 expect((raw.match(/\/Type \/Page\b/g)||[]).length).toBeGreaterThan(3);
 expect(buffer.length).toBeGreaterThan(5000);
},30000);
