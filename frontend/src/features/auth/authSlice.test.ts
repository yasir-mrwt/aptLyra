import {configureStore} from "@reduxjs/toolkit";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import authReducer,{restoreSession} from "./authSlice";
import type {AuthState,User} from "../../types/user";

const {post}=vi.hoisted(()=>({post:vi.fn()}));
vi.mock("../../services/apiClient",()=>({default:{post}}));

const savedUser:User={id:"restored-user",name:"Restored user",email:"restore@example.invalid",avatar:"",token:"old-local-token"};
function makeStore(){
  const authState:AuthState={user:savedUser,token:savedUser.token,isAuthenticated:true,isError:false,message:"",isSuccess:false,isLoading:false,
    isInitializing:true,isProfileLoading:false,isAvatarUploading:false,pendingVerificationEmail:null};
  return configureStore({reducer:{auth:authReducer},preloadedState:{auth:authState}});
}

describe("startup auth restoration",()=>{
  beforeEach(()=>{vi.clearAllMocks();localStorage.setItem("user",JSON.stringify(savedUser));});
  afterEach(()=>localStorage.clear());
  it("refreshes the cookie before protected UI can proceed",async()=>{
    post.mockResolvedValue({data:{message:"Token refreshed successfully"}});
    const store=makeStore();
    await store.dispatch(restoreSession()).unwrap();
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith("user/refresh",{});
    expect(store.getState().auth.isInitializing).toBe(false);
    expect(store.getState().auth.user?.id).toBe(savedUser.id);
  });
  it("clears stale local identity when refresh fails",async()=>{
    post.mockRejectedValue(new Error("expired refresh cookie"));
    const store=makeStore();
    await expect(store.dispatch(restoreSession()).unwrap()).rejects.toContain("saved session");
    expect(localStorage.getItem("user")).toBeNull();
    expect(store.getState().auth.isInitializing).toBe(false);
    expect(store.getState().auth.isAuthenticated).toBe(false);
  });
});
