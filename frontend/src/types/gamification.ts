export interface Badge {
  badgeId: string;
  earnedAt: string;
}

export interface Achievement {
  achievementId: string;
  progress: number;
  isCompleted: boolean;
  completedAt?: string;
}

export interface GamificationProfile {
  _id: string;
  user: string;
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string;
  xp: number;
  level: number;
  title: string;
  badges: Badge[];
  achievements: Achievement[];
  leaderboardOptIn: boolean;
}

export interface LeaderboardEntry {rank:number;name:string;mean:number;self:boolean}
export interface LeaderboardData {policy:string;reason:string|null;preference:{optedIn:boolean;displayName:string};groups:{id:string;label:string;participants:number;entries:LeaderboardEntry[]}[]}
