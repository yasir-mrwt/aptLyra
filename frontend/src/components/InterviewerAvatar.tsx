import React from "react";

/**
 * Ava — the animated AI interviewer.
 *
 * A flat-vector professional woman whose mouth opens with the REAL amplitude
 * of the TTS audio (WebAudio analyser), with idle blinking, breathing sway
 * and raised eyebrows while speaking. Pure SVG — no external services.
 */

interface InterviewerAvatarProps {
    /** Is the interviewer currently talking */
    speaking: boolean;
    /** 0..1 — live audio amplitude driving mouth openness */
    amplitude: number;
    /** Pixel size of the square avatar */
    size?: number;
}

const SKIN = "#e8b48c";
const SKIN_SHADOW = "#d9a075";
const HAIR = "#2b2020";
const HAIR_SHINE = "#453230";
const BLAZER = "#7c3aed";
const BLAZER_DARK = "#0b7c72";
const SHIRT = "#f4f4f5";
const LIP = "#b4574e";
const MOUTH_DARK = "#5e2825";

const InterviewerAvatar: React.FC<InterviewerAvatarProps> = ({
    speaking,
    amplitude,
    size = 160,
}) => {
    // Mouth geometry driven by live amplitude
    const mouthOpen = speaking ? Math.max(0.06, amplitude) : 0;
    const mouthRy = 1.2 + mouthOpen * 7.5;   // vertical opening
    const mouthRx = 7.5 - mouthOpen * 1.5;   // narrows slightly as it opens
    const browLift = speaking ? -1.6 : 0;    // eyebrows raise while talking

    return (
        <div
            className="relative select-none"
            style={{ width: size, height: size }}
            aria-label="AI interviewer avatar"
            role="img"
        >
            {/* Speaking glow ring */}
            <div
                className={`absolute inset-0 rounded-full transition-opacity duration-500 ${speaking ? "opacity-100 animate-pulse" : "opacity-0"}`}
                style={{
                    background:
                        "radial-gradient(circle, rgba(139,92,246,0.28) 0%, transparent 70%)",
                }}
            />

            <svg
                viewBox="0 0 200 200"
                width={size}
                height={size}
                className="relative z-10"
            >
                <defs>
                    <clipPath id="avatarCircle">
                        <circle cx="100" cy="100" r="96" />
                    </clipPath>
                </defs>

                {/* Backdrop disc */}
                <circle cx="100" cy="100" r="96" fill="#101014" />
                <circle
                    cx="100"
                    cy="100"
                    r="95"
                    fill="none"
                    stroke={speaking ? "rgba(167,139,250,0.55)" : "rgba(255,255,255,0.10)"}
                    strokeWidth="2"
                    style={{ transition: "stroke 400ms ease" }}
                />

                <g clipPath="url(#avatarCircle)">
                    {/* ---- Body (breathing sway) ---- */}
                    <g className="avatar-breathe">
                        {/* Shoulders / blazer */}
                        <path
                            d="M28 200 C30 152 62 138 100 138 C138 138 170 152 172 200 Z"
                            fill={BLAZER}
                        />
                        {/* Blazer lapels */}
                        <path d="M84 142 L100 176 L88 148 Z" fill={BLAZER_DARK} />
                        <path d="M116 142 L100 176 L112 148 Z" fill={BLAZER_DARK} />
                        {/* Shirt */}
                        <path d="M88 140 L100 170 L112 140 C108 146 92 146 88 140 Z" fill={SHIRT} />

                        {/* Neck */}
                        <rect x="88" y="112" width="24" height="34" rx="10" fill={SKIN_SHADOW} />

                        {/* ---- Head group (idle sway) ---- */}
                        <g className="avatar-sway" style={{ transformOrigin: "100px 120px" }}>
                            {/* Back hair */}
                            <path
                                d="M100 22 C58 22 44 54 46 88 C47 112 52 132 62 140 L138 140 C148 132 153 112 154 88 C156 54 142 22 100 22 Z"
                                fill={HAIR}
                            />

                            {/* Face */}
                            <ellipse cx="100" cy="86" rx="34" ry="38" fill={SKIN} />
                            {/* Ears */}
                            <ellipse cx="65" cy="88" rx="5" ry="8" fill={SKIN} />
                            <ellipse cx="135" cy="88" rx="5" ry="8" fill={SKIN} />
                            {/* Earrings */}
                            <circle cx="65" cy="97" r="2" fill="#a78bfa" />
                            <circle cx="135" cy="97" r="2" fill="#a78bfa" />

                            {/* Front hair — side-swept fringe */}
                            <path
                                d="M100 24 C64 24 56 52 58 76 C60 62 68 50 80 50 C96 52 84 44 100 40 C116 44 118 56 124 62 C132 68 140 66 142 76 C144 52 136 24 100 24 Z"
                                fill={HAIR}
                            />
                            <path
                                d="M100 24 C80 24 68 36 63 52 C74 40 88 36 100 36 C112 36 126 40 137 52 C132 36 120 24 100 24 Z"
                                fill={HAIR_SHINE}
                                opacity="0.5"
                            />

                            {/* Eyebrows (lift while speaking) */}
                            <g style={{ transform: `translateY(${browLift}px)`, transition: "transform 180ms ease" }}>
                                <path d="M74 70 Q82 66 90 69" stroke={HAIR} strokeWidth="2.6" fill="none" strokeLinecap="round" />
                                <path d="M110 69 Q118 66 126 70" stroke={HAIR} strokeWidth="2.6" fill="none" strokeLinecap="round" />
                            </g>

                            {/* Eyes (blink via CSS) */}
                            <g className="avatar-blink" style={{ transformOrigin: "100px 79px" }}>
                                <ellipse cx="82" cy="79" rx="5.2" ry="6" fill="#fff" />
                                <ellipse cx="118" cy="79" rx="5.2" ry="6" fill="#fff" />
                                <circle cx="82.5" cy="80" r="3.1" fill="#3b2a24" />
                                <circle cx="118.5" cy="80" r="3.1" fill="#3b2a24" />
                                <circle cx="83.6" cy="78.8" r="1" fill="#fff" />
                                <circle cx="119.6" cy="78.8" r="1" fill="#fff" />
                            </g>
                            {/* Upper lash lines */}
                            <path d="M76 75.5 Q82 72.5 88 75" stroke="#3b2a24" strokeWidth="1.4" fill="none" strokeLinecap="round" />
                            <path d="M112 75 Q118 72.5 124 75.5" stroke="#3b2a24" strokeWidth="1.4" fill="none" strokeLinecap="round" />

                            {/* Nose */}
                            <path d="M99 86 Q97 94 100 96 Q103 94 101 86" stroke={SKIN_SHADOW} strokeWidth="1.6" fill="none" strokeLinecap="round" />

                            {/* Blush */}
                            <ellipse cx="74" cy="94" rx="5" ry="2.6" fill="#e2907a" opacity="0.45" />
                            <ellipse cx="126" cy="94" rx="5" ry="2.6" fill="#e2907a" opacity="0.45" />

                            {/* ---- Mouth ---- */}
                            {speaking ? (
                                <g>
                                    {/* Open mouth scaled by live amplitude */}
                                    <ellipse cx="100" cy="107" rx={mouthRx} ry={mouthRy} fill={MOUTH_DARK} />
                                    {/* Teeth hint when wide open */}
                                    {mouthOpen > 0.28 && (
                                        <rect x={100 - mouthRx * 0.62} y={107 - mouthRy * 0.85} width={mouthRx * 1.24} height={Math.min(3, mouthRy * 0.4)} rx="1.2" fill="#fff" opacity="0.9" />
                                    )}
                                    <ellipse cx="100" cy={107 + mouthRy * 0.55} rx={mouthRx * 0.55} ry={Math.max(0.8, mouthRy * 0.32)} fill={LIP} opacity="0.85" />
                                </g>
                            ) : (
                                /* Warm resting smile */
                                <path d="M91 106 Q100 113 109 106" stroke={LIP} strokeWidth="3" fill="none" strokeLinecap="round" />
                            )}
                        </g>
                    </g>
                </g>
            </svg>
        </div>
    );
};

export default InterviewerAvatar;
