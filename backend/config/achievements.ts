export const ACHIEVEMENTS = {
  // Milestone badges
  FIRST_INTERVIEW: { id: "first_interview", name: "First Step", desc: "Complete your first interview", target: 1, category: "milestone" },
  INTERVIEW_10: { id: "interview_10", name: "Interviewer", desc: "Complete 10 interviews", target: 10, category: "milestone" },
  INTERVIEW_50: { id: "interview_50", name: "Seasoned Pro", desc: "Complete 50 interviews", target: 50, category: "milestone" },

  // Streak badges
  STREAK_3: { id: "streak_3", name: "Getting Started", desc: "3-day practice streak", target: 3, category: "engagement" },
  STREAK_7: { id: "streak_7", name: "Consistent", desc: "7-day practice streak", target: 7, category: "engagement" },
  STREAK_30: { id: "streak_30", name: "Unstoppable", desc: "30-day practice streak", target: 30, category: "engagement" },
  STREAK_100: { id: "streak_100", name: "Iron Will", desc: "100-day practice streak", target: 100, category: "engagement" },

  // Skill badges
  PERFECT_SCORE: { id: "perfect_score", name: "Perfect Score", desc: "Score 100 on any interview", target: 1, category: "skill" },
  SYSTEM_DESIGNER: { id: "system_designer", name: "Architect", desc: "Complete 1 system design interview", target: 1, category: "special" },
  
  // Speech & Communication badges
  SILVER_TONGUE: { id: "silver_tongue", name: "Silver Tongue", desc: "Zero filler words in a completed interview", target: 1, category: "communication" },
  PERFECT_CADENCE: { id: "perfect_cadence", name: "Perfect Cadence", desc: "Average speaking pace between 130-150 WPM", target: 1, category: "communication" },

  // Technical Diversity badges
  POLYGLOT: { id: "polyglot", name: "Polyglot", desc: "Submit code in 3 different languages across interviews", target: 3, category: "skill" },
  FULL_STACK_VISIONARY: { id: "full_stack_visionary", name: "Full-Stack Visionary", desc: "Complete frontend, backend, and system design interviews", target: 3, category: "skill" },

  // Grind badges
  NIGHT_OWL: { id: "night_owl", name: "Night Owl", desc: "Complete an interview between 12 AM and 4 AM", target: 1, category: "engagement" },
  WEEKEND_WARRIOR: { id: "weekend_warrior", name: "Weekend Warrior", desc: "Complete 3 interviews on weekends", target: 3, category: "engagement" },

  // Resilience
  COMEBACK_KID: { id: "comeback_kid", name: "Comeback Kid", desc: "Score < 40 on one question, and > 90 on the next in the same session", target: 1, category: "special" },
};

export const XP_REWARDS = {
  COMPLETE_INTERVIEW: 200,
  PERFECT_QUESTION: 50,
  STREAK_BONUS_DAY: 10,
  STREAK_MILESTONE: { 3: 50, 7: 150, 30: 500, 100: 2000 },
  FIRST_OF_DAY: 20,
  BADGE_EARNED: 200,
};

// Algorithmic Leveling System
export const getXPForLevel = (level: number): number => {
  if (level <= 1) return 0;
  // Algorithmic scale: XP = (Level - 1)^1.5 * 300
  return Math.floor(Math.pow(level - 1, 1.5) * 300);
};

export const getLevelForXP = (xp: number): number => {
  if (xp <= 0) return 1;
  // Level = (XP / 300)^(2/3) + 1
  return Math.floor(Math.pow(xp / 300, 2/3)) + 1;
};

export const TIERS = [
  { name: "Iron", startLevel: 1 },
  { name: "Bronze", startLevel: 5 },
  { name: "Silver", startLevel: 10 },
  { name: "Gold", startLevel: 20 },
  { name: "Platinum", startLevel: 35 },
  { name: "Diamond", startLevel: 50 },
  { name: "Ascendant", startLevel: 75 },
  { name: "Radiant", startLevel: 100 },
  { name: "Titan", startLevel: 150 },
  { name: "Legend", startLevel: 200 },
];

export const getTitleForLevel = (level: number): string => {
  let currentTier = TIERS[0];
  let nextTier = TIERS[1];
  
  for (let i = 0; i < TIERS.length; i++) {
    if (level >= TIERS[i].startLevel) {
      currentTier = TIERS[i];
      nextTier = TIERS[i+1] || { startLevel: currentTier.startLevel + 50 };
    }
  }

  // Calculate sub-tier (I, II, III) based on progress through the current tier
  const levelsInTier = nextTier.startLevel - currentTier.startLevel;
  const progress = level - currentTier.startLevel;
  
  let numeral = "";
  if (levelsInTier > 0) {
    const ratio = progress / levelsInTier;
    if (ratio < 0.33) numeral = "I";
    else if (ratio < 0.66) numeral = "II";
    else numeral = "III";
  }

  return `${currentTier.name} ${numeral}`.trim();
};
