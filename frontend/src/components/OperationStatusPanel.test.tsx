import {describe,it,expect,vi} from "vitest";
import {render,screen,fireEvent} from "@testing-library/react";
import OperationStatusPanel from "./OperationStatusPanel";
import reducer,{getSessionById,acceptSessionSnapshot,socketUpdateSession} from "../features/session/sessionSlice";
import type {Session,InterviewOperation} from "../types/session";
const session:Session={_id:"owned-session",user:"owner",role:"Backend Developer",level:"Junior",interviewType:"oral-only",status:"in-progress",
    runtimeVersion:"aptlyra-runtime-v1",runtimeState:"active",revision:7,questions:[{questionText:"FIFO?",questionType:"oral",isSubmitted:true,isEvaluated:false,processingState:"transcribing"}]};
const operation:InterviewOperation={id:"owned-operation",type:"evaluate",status:"retryable_failed",questionIndex:0,attempts:3,maxAttempts:3,totalAttempts:3,manualRetries:0,retryAvailable:true,nextRetryAt:null,errorCode:"provider_unavailable"};
describe("saved interview recovery",()=>{
    it("retries or cancels the existing saved operation and distinguishes report retry",()=>{
        const action=vi.fn().mockResolvedValue(undefined);
        const view=render(<OperationStatusPanel session={{...session,operations:[operation]}} onAction={action} />);
        expect(screen.getByRole("alert").textContent).toContain("Lyra paused");
        fireEvent.click(screen.getByRole("button",{name:"Retry saved work"}));expect(action).toHaveBeenCalledWith(operation.id,"retry");
        fireEvent.click(screen.getByRole("button",{name:"Cancel processing"}));expect(action).toHaveBeenCalledWith(operation.id,"cancel");
        view.rerender(<OperationStatusPanel session={{...session,runtimeState:"finishing",operations:[{...operation,type:"report",questionIndex:null}]}} onAction={action} />);
        expect(screen.getByRole("button",{name:"Retry report"})).toBeTruthy();expect(screen.queryByRole("button",{name:"Cancel processing"})).toBeNull();
    });
    it("describes transcription, bounded automatic retry and concept follow-up truthfully",()=>{
        const action=vi.fn();const view=render(<OperationStatusPanel session={{...session,operations:[{...operation,status:"running",retryAvailable:false,errorCode:null}]}} onAction={action} />);
        expect(screen.getByRole("status").textContent).toContain("transcribing your saved recording");
        view.rerender(<OperationStatusPanel session={{...session,operations:[{...operation,attempts:1,retryAvailable:false,nextRetryAt:"2026-10-07T00:00:00Z"}]}} onAction={action} />);
        expect(screen.getByRole("status").textContent).toContain("2 of 3");
        view.rerender(<OperationStatusPanel session={{...session,operations:[{...operation,type:"follow-up",status:"queued",retryAvailable:false}]}} onAction={action} />);
        expect(screen.getByRole("status").textContent).toContain("a concept follow-up");
        view.rerender(<OperationStatusPanel session={{...session,operations:[]}} connection="recovering" onAction={action} />);
        expect(screen.getByRole("status").textContent).toContain("Reconnecting to live updates");
        view.rerender(<OperationStatusPanel session={{...session,operations:[{...operation,status:"running",retryAvailable:false,errorCode:null}]}} connection="connected" onAction={action} />);
        fireEvent.click(screen.getByRole("button",{name:"Cancel processing"}));expect(action).toHaveBeenCalledWith(operation.id,"cancel");
    });
    it("ignores stale REST snapshots and content-bearing durable socket messages",()=>{
        expect(acceptSessionSnapshot(session,{...session,revision:6,status:"completed"})).toBe(session);
        let state=reducer(undefined,getSessionById.pending("request",session._id));
        state=reducer(state,getSessionById.fulfilled(session,"request",session._id));
        const hostile={sessionId:session._id,revision:8,eventId:"event",operationId:"operation",state:"completed",session:{...session,status:"completed" as const},message:"untrusted provider message"};
        state=reducer(state,socketUpdateSession(hostile));expect(state.activeSession?.status).toBe("in-progress");expect(state.message).toBe("");
        state=reducer(state,socketUpdateSession(hostile));expect(state.activeSession?.revision).toBe(7);
        state=reducer(state,getSessionById.fulfilled({...session,revision:6},"older",session._id));expect(state.activeSession?.revision).toBe(7);
        state=reducer(state,getSessionById.fulfilled({...session,revision:9,status:"completed"},"fresh",session._id));expect(state.activeSession?.status).toBe("completed");
    });
});
