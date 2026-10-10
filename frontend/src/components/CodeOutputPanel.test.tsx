import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {afterEach, describe, expect, it, vi} from "vitest";
import CodeOutputPanel from "./CodeOutputPanel";
import {executeCode} from "../services/codeRunnerService";
vi.mock("../services/codeRunnerService",()=>({isExecutable:(language:string)=>["javascript","python"].includes(language),executeCode:vi.fn()}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
describe("owned coding execution availability",()=>{
 it("hides Run for a question without execution specifications",()=>{
  render(<CodeOutputPanel language="python" code="answer" context={{sessionId:"owned",questionIndex:0}}/>);
  expect(screen.getByText("Automated execution tests are not available for this question.")).toBeTruthy();
  expect(screen.queryByRole("button",{name:/Run/})).toBeNull();expect(executeCode).not.toHaveBeenCalled();
 });
 it.each(["javascript","python"])("runs the supported specification in %s with the owned context",async language=>{
  vi.mocked(executeCode).mockResolvedValue({stdout:"passed",stderr:"",exitCode:0,signal:null,timedOut:false});
  const context={sessionId:"owned",questionIndex:1};
  render(<CodeOutputPanel language={language} code="solution" context={context} executionTestId="binary-search-v1"/>);
  fireEvent.click(screen.getByRole("button",{name:/Run/}));
  await waitFor(()=>expect(executeCode).toHaveBeenCalledWith(language,"solution","",context));
  expect(await screen.findByText("passed")).toBeTruthy();
 });
});
