import React from 'react';

interface BadgeIconProps {
  badgeId: string;
  className?: string;
}

const BaseRosette = ({ children, color = "#20C997" }: { children: React.ReactNode, color?: string }) => (
  <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-lg" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Outer decorative ring */}
    <path
      d="M50 5C60 5 62.5 15 72.5 15C82.5 15 85 25 90 32.5C95 40 85 47.5 85 50C85 52.5 95 60 90 67.5C85 75 82.5 85 72.5 85C62.5 85 60 95 50 95C40 95 37.5 85 27.5 85C17.5 85 15 75 10 67.5C5 60 15 52.5 15 50C15 47.5 5 40 10 32.5C15 25 17.5 15 27.5 15C37.5 15 40 5 50 5Z"
      stroke={color} strokeWidth="2" strokeDasharray="4 2" className="opacity-40"
    />
    {/* Inner solid shape */}
    <path
      d="M50 12C57.5 12 60 20 67.5 20C75 20 77.5 28 81 33.5C84.5 39 77.5 45.5 77.5 50C77.5 54.5 84.5 61 81 66.5C77.5 72 75 80 67.5 80C60 80 57.5 88 50 88C42.5 88 40 80 32.5 80C25 80 22.5 72 19 66.5C15.5 61 22.5 54.5 22.5 50C22.5 45.5 15.5 39 19 33.5C22.5 28 25 20 32.5 20C40 20 42.5 12 50 12Z"
      fill={`${color}15`} stroke={color} strokeWidth="3"
    />
    {/* Inner decorative circle */}
    <circle cx="50" cy="50" r="28" stroke={color} strokeWidth="1" className="opacity-60" />
    <circle cx="50" cy="50" r="24" fill={`${color}20`} />
    {children}
  </svg>
);

export const BadgeIcon: React.FC<BadgeIconProps> = ({ badgeId, className = "w-16 h-16" }) => {
  // Use a sea-green color similar to the mockup
  const accent = "#a78bfa";
  const gold = "#f59e0b";
  const blue = "#3b82f6";
  const purple = "#8b5cf6";

  const getBadgeContent = () => {
    switch (badgeId) {
      case 'first_interview':
        return (
          <BaseRosette color={accent}>
            <path d="M40 55L47 62L60 40" stroke={accent} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          </BaseRosette>
        );
      case 'interview_10':
      case 'interview_50':
        return (
          <BaseRosette color={badgeId === 'interview_50' ? gold : blue}>
            <circle cx="50" cy="50" r="10" stroke={badgeId === 'interview_50' ? gold : blue} strokeWidth="3" />
            <circle cx="50" cy="50" r="4" fill={badgeId === 'interview_50' ? gold : blue} />
          </BaseRosette>
        );
      case 'streak_3':
      case 'streak_7':
      case 'streak_30': {
        const streakColor = badgeId === 'streak_30' ? gold : badgeId === 'streak_7' ? purple : accent;
        return (
          <BaseRosette color={streakColor}>
            <path d="M45 60C45 60 38 52 38 45C38 38 45 35 50 32C55 35 62 38 62 45C62 52 55 60 55 60" fill="none" stroke={streakColor} strokeWidth="3" strokeLinecap="round" />
            <path d="M48 55C48 55 44 50 44 46C44 42 48 40 50 38" fill="none" stroke={streakColor} strokeWidth="2" strokeLinecap="round" />
          </BaseRosette>
        );
      }
      case 'perfect_score':
        return (
          <BaseRosette color={gold}>
            <path d="M50 33L53 43H64L55 49L58 59L50 53L42 59L45 49L36 43H47L50 33Z" fill="none" stroke={gold} strokeWidth="3" strokeLinejoin="round" />
          </BaseRosette>
        );
      case 'system_designer':
        return (
          <BaseRosette color={accent}>
            <path d="M40 50L35 45L40 40" stroke={accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M60 50L65 45L60 40" stroke={accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M45 55L55 35" stroke={accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </BaseRosette>
        );
      default:
        // Generic Shield for unknown badges
        return (
          <BaseRosette color={accent}>
            <path d="M50 35L38 40V48C38 55 43 61 50 65C57 61 62 55 62 48V40L50 35Z" fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </BaseRosette>
        );
    }
  };

  return (
    <div className={className} title={badgeId.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}>
      {getBadgeContent()}
    </div>
  );
};
