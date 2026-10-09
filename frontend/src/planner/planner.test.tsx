import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {MemoryRouter,Route,Routes} from "react-router-dom";
import {Provider} from "react-redux";
import {store} from "../app/store";
import NewInterviewForm from "../components/NewInterviewForm";
import PlanPreview from "../components/PlanPreview";
import InterviewPlan from "../pages/InterviewPlan";
import AIInterviewer from "../components/AIInterviewer";
import {confirmPlan,getPlan,getPlannerCapabilities,previewPlan} from "../services/plannerApi";
import {setupError,type PlanPreviewData,type PlannerSetup} from "./contracts";
vi.mock("../services/plannerApi",()=>({previewPlan:vi.fn(),getPlan:vi.fn(),confirmPlan:vi.fn(),getPlannerCapabilities:vi.fn(),plannerMessage:()=>"Planning unavailable; retry."}));
const renderForm=(props:React.ComponentProps<typeof NewInterviewForm>)=>render(<Provider store={store}><NewInterviewForm {...props}/></Provider>);
const setup:PlannerSetup={role:"Software Engineer",level:"junior",taxonomyVersion:"junior-se-v1",competencies:["dsa","programming"],difficulty:"standard",mode:"mixed",count:5,minutes:30,language:"en",codeLanguage:"javascript",modifiers:{}};
const plan:PlanPreviewData={id:"plan",sessionId:"session",revision:1,status:"ready",role:setup.role,mode:setup.mode,setup,effectiveCount:3,requestedCount:5,effectiveMinutes:23,requestedMinutes:30,
 coverage:{dsa:2,programming:1},difficultyDistribution:{easy:1,standard:2,stretch:0},timeBudget:{setupWrapMinutes:2,probeReserveMinutes:4,questionMinutes:17,slackMinutes:7},shortages:["count_reduced_for_time_or_evidence"],canConfirm:true,confirmedAt:null,evaluationMode:"legacy",
 items:[{id:"stable-item",position:0,competency:"dsa.structures",category:"coding",difficulty:"standard",selectionReason:"filtered_retrieval",estimatedMinutes:8,available:true}]};
beforeEach(()=>{vi.clearAllMocks();vi.mocked(getPlannerCapabilities).mockResolvedValue({companies:[],eligibleReviewedQuestions:4,provisionalQuestions:0});});
afterEach(cleanup);
describe("supported planner setup",()=>{
 it("shows junior scope, hides unsupported roles/resume context and only supported languages",async()=>{
  renderForm({preferredRole:"Architect",onCreated:vi.fn()});
  await waitFor(()=>expect(getPlannerCapabilities).toHaveBeenCalled());
  expect((screen.getByLabelText("Role") as HTMLSelectElement).value).toBe("Software Engineer");
  expect(screen.queryByRole("option",{name:"Architect"})).toBeNull();
  expect(screen.getByText(/Resume and JD personalization are unavailable/)).toBeTruthy();expect(screen.getByText(/Company\/date focus is unavailable/)).toBeTruthy();
  expect(screen.getByRole("option",{name:"Python"})).toBeTruthy();expect(screen.queryByRole("option",{name:"Rust"})).toBeNull();
 });
 it("validates 1–4 topics and count/time before contacting server",async()=>{
  renderForm({onCreated:vi.fn()});
  fireEvent.click(screen.getByLabelText("Data Structures & Algorithms"));fireEvent.click(screen.getByLabelText("Programming / Coding"));
  fireEvent.click(screen.getByRole("button",{name:"Preview plan"}));
  expect(screen.getByRole("alert").textContent).toContain("one and four");expect(previewPlan).not.toHaveBeenCalled();
  expect(setupError({...setup,competencies:["a","b","c","d","e"]})).toBeTruthy();expect(setupError({...setup,count:2})).toBeTruthy();expect(setupError({...setup,minutes:61})).toBeTruthy();
 });
 it("preparing state follows the actual request, prevents duplicate previews and returns persisted plan ID",async()=>{
  let resolve:(p:PlanPreviewData)=>void=()=>{};vi.mocked(previewPlan).mockImplementation(()=>new Promise(r=>{resolve=r;}));const created=vi.fn();
  renderForm({onCreated:created});
  fireEvent.click(screen.getByRole("button",{name:"Preview plan"}));expect(screen.getByRole("status").textContent).toBe("Preparing your plan");
  expect((screen.getByRole("button",{name:"Preparing plan…"}) as HTMLButtonElement).disabled).toBe(true);
  await act(async()=>resolve(plan));expect(previewPlan).toHaveBeenCalledTimes(1);expect(created).toHaveBeenCalledWith("plan");
  expect(vi.mocked(previewPlan).mock.calls[0][0].modifiers).toEqual({});
 });
 it("reports planning failure, allows retry and never claims a ready plan",async()=>{
  vi.mocked(previewPlan).mockRejectedValueOnce(new Error("fixture failure")).mockResolvedValueOnce(plan);const created=vi.fn();
  renderForm({onCreated:created});fireEvent.click(screen.getByRole("button",{name:"Preview plan"}));
  await waitFor(()=>expect(screen.getByRole("alert").textContent).toContain("retry"));expect(screen.getByRole("status").textContent).toBe("Retry available");
  fireEvent.click(screen.getByRole("button",{name:"Retry preview"}));await waitFor(()=>expect(created).toHaveBeenCalledWith("plan"));
 });
 it("company/date availability uses actual capability response and modifiers leave core mode unchanged",async()=>{
  vi.mocked(getPlannerCapabilities).mockResolvedValue({companies:["Permitted example"],eligibleReviewedQuestions:4,provisionalQuestions:0});vi.mocked(previewPlan).mockResolvedValue(plan);
  renderForm({onCreated:vi.fn()});await waitFor(()=>expect(screen.getByLabelText("Company preference")).toBeTruthy());
  fireEvent.change(screen.getByLabelText("Company preference"),{target:{value:"Permitted example"}});fireEvent.click(screen.getByRole("button",{name:"Preview plan"}));
  await waitFor(()=>expect(previewPlan).toHaveBeenCalled());expect(vi.mocked(previewPlan).mock.calls[0][0].mode).toBe("mixed");expect(vi.mocked(previewPlan).mock.calls[0][0].modifiers.company).toBe("Permitted example");
 });
 it("explains empty reviewed readiness without treating provisional content as reviewed",async()=>{
  vi.mocked(getPlannerCapabilities).mockResolvedValue({companies:[],eligibleReviewedQuestions:0,provisionalQuestions:2});
  renderForm({onCreated:vi.fn()});
  await waitFor(()=>expect(screen.getByText("Not enough reviewed questions are available for this setup yet.")).toBeTruthy());
  expect(screen.queryByText(/provisional questions exist/)).toBeNull();
  expect(screen.queryByRole("link",{name:"Open editorial review"})).toBeNull();
 });
 it("offers a retry when readiness metadata cannot load",async()=>{
  vi.mocked(getPlannerCapabilities).mockRejectedValueOnce(new Error("fixture offline"));
  renderForm({onCreated:vi.fn()});
  await waitFor(()=>expect(screen.getByRole("alert").textContent).toContain("temporarily unavailable"));
  vi.mocked(getPlannerCapabilities).mockResolvedValueOnce({companies:[],eligibleReviewedQuestions:3,provisionalQuestions:0});
  fireEvent.click(screen.getByRole("button",{name:"Retry"}));
  await waitFor(()=>expect(screen.queryByRole("alert")).toBeNull());
 });
});
describe("owned plan preview and confirmation",()=>{
 it("explains new rubric practice without claiming reviewed grading readiness",()=>{
  render(<PlanPreview plan={{...plan,evaluationMode:"rubric-v1"}} confirming={false} error={null} onConfirm={vi.fn()} onEdit={vi.fn()}/>);
  expect(screen.getByText(/separate evaluator confidence/)).toBeTruthy();expect(screen.getByText(/provisional or withheld/)).toBeTruthy();expect(screen.queryByText(/uses legacy evaluation/)).toBeNull();
 });
 it("renders actual coverage/distribution/shortages/time and no hidden answers",()=>{
  render(<PlanPreview plan={plan} confirming={false} error={null} onConfirm={vi.fn()} onEdit={vi.fn()}/>);
  expect(screen.getByText(/3 of 5 requested/)).toBeTruthy();expect(screen.getByText(/Data Structures & Algorithms: 2/)).toBeTruthy();expect(screen.getByText(/Easy: 1/)).toBeTruthy();expect(screen.getByRole("alert").textContent).toContain("reduced");expect(screen.getByText(/legacy evaluation/)).toBeTruthy();
 });
 it("shortage blocks confirm while preserving visible company/date constraints and edit action",()=>{
  const edit=vi.fn();render(<PlanPreview plan={{...plan,canConfirm:false,effectiveCount:0,setup:{...setup,modifiers:{company:"Unavailable company"}},shortages:["company_date_evidence_unavailable_constraints_preserved"]}} confirming={false} error={null} onConfirm={vi.fn()} onEdit={edit}/>);
  expect((screen.getByRole("button",{name:"Confirm and start"}) as HTMLButtonElement).disabled).toBe(true);expect(screen.getByRole("alert").textContent).toContain("preserved");
  fireEvent.click(screen.getByRole("button",{name:"Change setup / preferences"}));expect(edit).toHaveBeenCalled();
 });
 it("transitioning/error states remain tied to confirm request and existing speaking/listening states stay available",()=>{
  const {rerender}=render(<AIInterviewer state="idle"/>);expect(screen.getByRole("status").textContent).toBe("Ready to plan");
  for(const [state,label] of [["preparing","Preparing your plan"],["plan-ready","Plan ready for review"],["transitioning","Starting confirmed practice"],["error/retry","Retry available"],["speaking","Speaking"],["listening","Listening"],["evaluating","Processing answer"]] as const){rerender(<AIInterviewer state={state}/>);expect(screen.getByRole("status").textContent).toBe(label);}
 });
 it("reloads persisted preview, confirms its revision and navigates only after successful response",async()=>{
  vi.mocked(getPlan).mockResolvedValue(plan);let resolve:(v:{sessionId:string})=>void=()=>{};vi.mocked(confirmPlan).mockImplementation(()=>new Promise(r=>{resolve=r;}));
  render(<MemoryRouter initialEntries={["/plans/plan"]}><Routes><Route path="/plans/:planId" element={<InterviewPlan/>}/><Route path="/interview/:sessionId" element={<p>Confirmed runner</p>}/></Routes></MemoryRouter>);
  await waitFor(()=>expect(screen.getByRole("button",{name:"Confirm and start"})).toBeTruthy());fireEvent.click(screen.getByRole("button",{name:"Confirm and start"}));
  expect(screen.getByRole("status").textContent).toBe("Starting confirmed practice");expect(screen.queryByText("Confirmed runner")).toBeNull();
  await act(async()=>resolve({sessionId:"session"}));await waitFor(()=>expect(screen.getByText("Confirmed runner")).toBeTruthy());expect(confirmPlan).toHaveBeenCalledWith(plan);
 });
 it("failed confirmation keeps preview and enables retry",async()=>{
  vi.mocked(getPlan).mockResolvedValue(plan);vi.mocked(confirmPlan).mockRejectedValue(new Error("stale"));
  render(<MemoryRouter initialEntries={["/plans/plan"]}><Routes><Route path="/plans/:planId" element={<InterviewPlan/>}/></Routes></MemoryRouter>);
  await waitFor(()=>expect(screen.getByRole("button",{name:"Confirm and start"})).toBeTruthy());fireEvent.click(screen.getByRole("button",{name:"Confirm and start"}));
  await waitFor(()=>expect(screen.getAllByRole("alert").some(e=>e.textContent?.includes("retry"))).toBe(true));expect((screen.getByRole("button",{name:"Confirm and start"}) as HTMLButtonElement).disabled).toBe(false);
 });
});
