import {configureStore} from "@reduxjs/toolkit";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import authReducer,{restoreSession} from "./authSlice";
import type {AuthState,User} from "../../types/user";

const {get}=vi.hoisted(()=>({get:vi.fn()}));
vi.mock("../../services/apiClient",()=>({default:{get}}));

const savedUser:User={id:"restored-user",name:"Restored user",email:"restore@example.invalid",avatar:"",token:"old-local-token"};
function makeStore(){
  const authState:AuthState={user:savedUser,token:savedUser.token,isAuthenticated:true,isError:false,message:"",isSuccess:false,isLoading:false,
    isInitializing:true,isProfileLoading:false,isAvatarUploading:false,pendingVerificationEmail:null};
  return configureStore({reducer:{auth:authReducer},preloadedState:{auth:authState}});
}

describe("startup auth restoration",()=>{
  beforeEach(()=>{vi.clearAllMocks();localStorage.setItem("user",JSON.stringify(savedUser));});
  afterEach(()=>localStorage.clear());
  it("validates the access cookie without rotating refresh on every reload",async()=>{
    get.mockResolvedValue({data:{message:"Token refreshed successfully"}});
    const store=makeStore();
    await store.dispatch(restoreSession()).unwrap();
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith("/user/profile",{timeout:15000});
    expect(store.getState().auth.isInitializing).toBe(false);
    expect(store.getState().auth.user?.id).toBe(savedUser.id);
  });
  it("keeps the saved identity during a service outage so retry remains possible",async()=>{
    get.mockRejectedValue({isAxiosError:true,response:{status:503}});const store=makeStore();
    await store.dispatch(restoreSession()).unwrap();expect(store.getState().auth.user?.id).toBe(savedUser.id);expect(localStorage.getItem("user")).not.toBeNull();
  });
  it("clears stale local identity when refresh fails",async()=>{
    get.mockRejectedValue(new Error("expired refresh cookie"));
    const store=makeStore();
    await expect(store.dispatch(restoreSession()).unwrap()).rejects.toContain("saved session");
    expect(localStorage.getItem("user")).toBeNull();
    expect(store.getState().auth.isInitializing).toBe(false);
    expect(store.getState().auth.isAuthenticated).toBe(false);
  });
});
