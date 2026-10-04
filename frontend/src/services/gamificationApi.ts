import apiClient from "./apiClient";
import type { GamificationProfile, LeaderboardEntry } from "../types/gamification";

export const getGamificationProfile = async (): Promise<GamificationProfile> => {
  const response = await apiClient.get(`/gamification/profile`);
  return response.data;
};

export const getLeaderboard = async (limit: number = 50): Promise<LeaderboardEntry[]> => {
  const response = await apiClient.get(`/gamification/leaderboard`, {
    params: { limit }
  });
  return response.data;
};
