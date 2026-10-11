import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { logout } from "./authSlice";
import apiClient from "../../services/apiClient";

export type AppRole = "owner" | "admin" | "reviewer" | "user";
type RoleState = { role:AppRole|null; reviewerLinked:boolean; canReview:boolean; reviewerReason:string|null; userId:string|null; status:"idle"|"loading"|"ready"|"failed" };
const initialState:RoleState={role:null,reviewerLinked:false,canReview:false,reviewerReason:null,userId:null,status:"idle"};

export const fetchCurrentRole=createAsyncThunk("role/fetchCurrent",async({userId}:{userId:string;force?:boolean})=>{
  const response=await apiClient.get<{role:AppRole;reviewerLinked:boolean;canReview:boolean;reviewerReason:string|null}>("/admin/me");
  return {userId,role:response.data.role,reviewerLinked:response.data.reviewerLinked,canReview:response.data.canReview,reviewerReason:response.data.reviewerReason};
},{condition:({userId,force}:{userId:string;force?:boolean},{getState})=>{
  const current=(getState() as {role:RoleState}).role;
  return force===true||!(current.userId===userId&&(current.status==="loading"||current.status==="ready"));
}});

const roleSlice=createSlice({name:"role",initialState,reducers:{clearRole:()=>initialState},extraReducers:builder=>{
  builder.addCase(fetchCurrentRole.pending,(state,action)=>{state.status="loading";state.userId=action.meta.arg.userId;state.role=null;state.reviewerLinked=false;state.canReview=false;state.reviewerReason=null;});
  builder.addCase(fetchCurrentRole.fulfilled,(state,action)=>{state.status="ready";state.userId=action.payload.userId;state.role=action.payload.role;state.reviewerLinked=action.payload.reviewerLinked;state.canReview=action.payload.canReview;state.reviewerReason=action.payload.reviewerReason;});
  builder.addCase(fetchCurrentRole.rejected,(state,action)=>{state.status="failed";state.userId=action.meta.arg.userId;state.role=null;state.reviewerLinked=false;state.canReview=false;state.reviewerReason="Reviewer access could not be verified.";});
  builder.addCase(logout.fulfilled,()=>initialState);
}});
export const {clearRole}=roleSlice.actions;
export const roleReducer=roleSlice.reducer;
export const roleNavigation=(role:AppRole|null)=>[
  ...(role&&["owner","admin","reviewer"].includes(role)?[{to:"/content-editorial",label:"Editorial Review"}]:[]),
  ...(role&&["owner","admin"].includes(role)?[{to:"/admin/team",label:"Team Access"}]:[]),
];
