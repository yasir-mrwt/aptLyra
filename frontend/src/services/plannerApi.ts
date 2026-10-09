import axios from "axios";
import apiClient from "./apiClient";
import type { PlannerSetup,PlanPreviewData } from "../planner/contracts";
export const previewPlan=async(setup:PlannerSetup)=>(await apiClient.post<PlanPreviewData>("/interview-plans/preview",setup,{timeout:90000})).data;
export const getPlan=async(id:string)=>(await apiClient.get<PlanPreviewData>(`/interview-plans/${id}`)).data;
export const confirmPlan=async(plan:PlanPreviewData)=>(await apiClient.post<{sessionId:string}>("/interview-plans/confirm",{planId:plan.id,revision:plan.revision},{timeout:30000})).data;
export const getPlannerCapabilities=async()=>(await apiClient.get<{companies:string[];eligibleReviewedQuestions:number;provisionalQuestions:number}>("/interview-plans/capabilities")).data;
export const plannerMessage=(error:unknown)=>axios.isAxiosError(error) && typeof error.response?.data?.message==="string"?error.response.data.message:"Planning is unavailable. Retry your preview.";
