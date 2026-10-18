import {activityLeaderboard} from "../services/activityLeaderboard.js";
import {query} from "../config/db.js";
import {practiceCalendar} from "../services/practiceCalendar.js";
import { Response } from "express";
import { gamificationService } from "../services/gamificationService.js";
import { AuthenticatedRequest } from "../types/express.js";
import { getTitleForLevel, getXPForLevel } from "../config/achievements.js";

export const getProfile = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const profile = await gamificationService.getProfile(userId);
    const title = getTitleForLevel(profile.level);
    res.json({ ...profile, title, currentLevelXp:getXPForLevel(profile.level),nextLevelXp:getXPForLevel(profile.level+1) });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getLeaderboard = async (req: AuthenticatedRequest, res: Response) => {
  try { res.json(await activityLeaderboard(req.user!._id)); }
  catch { res.status(503).json({message:"Leaderboard temporarily unavailable."}); }
};
export const setLeaderboardPreference = async (req: AuthenticatedRequest, res: Response) => {
  const {optedIn,displayName}=req.body || {};
  if(typeof optedIn!=="boolean" || typeof displayName!=="string" || !/^[\p{L}\p{N} _-]{2,32}$/u.test(displayName.trim())) {
    res.status(400).json({message:"Choose a public alias of 2–32 letters, numbers, spaces, underscores or hyphens."});return;
  }
  try {
    await query(`INSERT INTO practice_leaderboard_preferences(user_id,opted_in,display_name) VALUES($1,$2,$3)
      ON CONFLICT(user_id) DO UPDATE SET opted_in=$2,display_name=$3,updated_at=now()`,[req.user!._id,optedIn,displayName.trim()]);
    res.json({optedIn,displayName:displayName.trim()});
  } catch { res.status(503).json({message:"Could not save leaderboard preferences."}); }
};

export const syncGamification = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!._id.toString();
    const streakResult = await gamificationService.updateStreak(userId);
    const flushResult = await gamificationService.flushXP(userId);
    res.json({ streak: streakResult, flush: flushResult });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getPracticeCalendar=async(req:AuthenticatedRequest,res:Response)=>{
  try{
    const rows=(await query("SELECT DISTINCT to_char(coalesce(end_time,start_time,created_at) AT TIME ZONE 'UTC','YYYY-MM-DD') AS day FROM sessions WHERE user_id=$1 AND status='completed'",[req.user!._id])).rows;
    res.json(practiceCalendar(rows.map(row=>row.day)));
  }catch{res.status(503).json({message:"Practice calendar is temporarily unavailable. Retry shortly."});}
};
