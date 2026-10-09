import { BRAND } from "../constants/brand";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ChevronDown,
  Mic,
  Code2,
  PenTool,
  BarChart3,
  FileText,
  Trophy,
  ArrowRight,
  Zap,
} from "lucide-react";
import InterviewerAvatar from "../components/InterviewerAvatar";
import AptlyraMark from "../components/AptlyraMark";

/**
 * Aptlyra landing — pitch-black grid canvas, monochrome typography,
 * and a 3D mouse-tilt hero card where Lyra (the AI interviewer) is
 * literally talking. No tech jargon — pure product story.
 */

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: i * 0.08, ease: "easeOut" as const },
  }),
};

const FEATURES = [
  {
    icon: Mic,
    title: "A Real Voice Interview",
    desc: `${BRAND.interviewer} guides your practice aloud and helps you explain your reasoning. You can also answer by typing.`,
  },
  {
    icon: Code2,
    title: "Live Coding Rounds",
    desc: "Write and run code, then explain your reasoning. Execution facts and concept feedback are reported separately.",
  },
  {
    icon: PenTool,
    title: "Design on a Whiteboard",
    desc: "Explore optional junior design questions. Feedback withholds scores when the answer or rubric evidence is insufficient.",
  },
  {
    icon: BarChart3,
    title: "Know How You Sound",
    desc: "When speech analysis is available, review pace, filler words and pauses alongside your technical feedback.",
  },
  {
    icon: FileText,
    title: "Resume Intelligence",
    desc: "Upload your resume and a job description: get honest scores, credibility risks interviewers will probe, and a prep plan.",
  },
  {
    icon: Trophy,
    title: "Progress You Can Feel",
    desc: "Levels, streaks and badges track your grind — and a shareable report card proves it after every session.",
  },
];

const STEPS = [
  {
    step: "01",
    title: "Pick your target",
    desc: "Choose junior software engineering topics and an estimated duration, then preview your evidence-grounded question plan.",
  },
  {
    step: "02",
    title: "Face the interviewer",
    desc: "Answer by voice or text, practice coding, and explain your reasoning at your own pace.",
  },
  {
    step: "03",
    title: "Read the verdict",
    desc: "Review evidence-grounded concept feedback, confidence and score availability, with a downloadable report card.",
  },
];

/** Lyra periodically "speaks" in the hero — mouth syncing to a fake amplitude. */
const useHeroInterviewerVoice = () => {
  const [speaking, setSpeaking] = useState(false);
  const [amplitude, setAmplitude] = useState(0);

  useEffect(() => {
    let ampTimer: ReturnType<typeof setInterval> | null = null;

    const cycle = setInterval(() => {
      setSpeaking(true);
      ampTimer = setInterval(() => setAmplitude(0.25 + Math.random() * 0.55), 100);

      setTimeout(() => {
        if (ampTimer) clearInterval(ampTimer);
        setSpeaking(false);
        setAmplitude(0);
      }, 3200);
    }, 6500);

    return () => {
      clearInterval(cycle);
      if (ampTimer) clearInterval(ampTimer);
    };
  }, []);

  return { speaking, amplitude };
};

/** Ticking session clock — makes the hero card feel like a live call. */
const useSessionClock = () => {
  const [secs, setSecs] = useState(694);
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
};

const WAVE_FACTORS = [0.5, 0.85, 0.65, 1, 0.75, 0.9, 0.55];

/** Voice bars — amplitude-driven when Lyra speaks, gentle idle pulse otherwise. */
const HeroWaveform = ({ amplitude, active }: { amplitude: number; active: boolean }) => (
  <div className="flex h-5 shrink-0 items-center gap-[3px]">
    {WAVE_FACTORS.map((f, i) => (
      <span
        key={i}
        className={`w-[3px] rounded-full transition-[height,background-color] duration-150 ${
          active ? "bg-emerald-400" : "wave-idle bg-zinc-600"
        }`}
        style={
          active
            ? { height: `${Math.round(Math.max(0.18, Math.min(1, amplitude * f + 0.12)) * 100)}%` }
            : { height: "30%", animationDelay: `${i * 0.13}s` }
        }
      />
    ))}
  </div>
);

/** 3D mouse-tilt wrapper for the hero card. */
const TiltCard = ({ children }: { children: React.ReactNode }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const handleMove = (e: React.MouseEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: py * -14, y: px * 14 });
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={() => setTilt({ x: 0, y: 0 })}
      style={{ perspective: "1200px" }}
    >
      <div
        style={{
          transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          transition: "transform 300ms cubic-bezier(0.22, 1, 0.36, 1)",
          transformStyle: "preserve-3d",
        }}
      >
        {children}
      </div>
    </div>
  );
};

const Landing = () => {
  const { speaking, amplitude } = useHeroInterviewerVoice();
  const clock = useSessionClock();

  return (
    <div className="landing-grid relative min-h-screen w-full overflow-x-hidden bg-[#050505] text-zinc-300 font-display">
      {/* Soft spotlight behind the hero */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[60vh]"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(255,255,255,0.06), transparent 70%)",
        }}
      />
      {/* Slow-drifting aurora orbs — depth without color noise */}
      <div aria-hidden className="aurora-orb w-[420px] h-[420px] top-[8%] left-[12%] bg-white/[0.05]" />
      <div aria-hidden className="aurora-orb w-[380px] h-[380px] top-[30%] right-[8%] bg-violet-500/[0.06]" style={{ animationDelay: "-7s" }} />

      {/* ───────────────────────── Navbar ───────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-[#050505]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2.5">
            <AptlyraMark className="h-8 w-8" />
            <span className="text-[17px] font-extrabold tracking-tight text-white">
              {BRAND.name}
            </span>
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            <a href="#home" className="text-sm text-zinc-400 transition-colors hover:text-white">
              Home
            </a>
            <a href="#features" className="text-sm text-zinc-400 transition-colors hover:text-white">
              Features
            </a>
            <a href="#how-it-works" className="text-sm text-zinc-400 transition-colors hover:text-white">
              How It Works
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="rounded-full border border-white/15 px-5 py-1.5 text-sm font-semibold text-zinc-200 transition-all hover:bg-white/5 hover:text-white"
            >
              Log In
            </Link>
            <Link
              to="/register"
              className="rounded-full bg-white px-5 py-1.5 text-sm font-semibold text-black transition-transform hover:scale-[1.03] active:scale-[0.97] shadow-[0_0_20px_rgba(255,255,255,0.15)]"
            >
              Sign Up
            </Link>
          </div>
        </div>
      </header>

      {/* ───────────────────────── Hero ───────────────────────── */}
      <section
        id="home"
        className="relative z-10 mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl items-center gap-16 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-8 lg:px-8"
      >
        {/* Left — story */}
        <div className="text-center lg:text-left">
          <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0}>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-[13px] text-zinc-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              {BRAND.tagline}
            </span>
          </motion.div>

          <motion.h1
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={1}
            className="mt-8 text-[clamp(2.9rem,7vw,5.6rem)] font-black leading-[0.95] tracking-tight"
          >
            <span className="block text-white">Skip the</span>
            <span className="block text-zinc-500">Nerves.</span>
            <span className="headline-shine block">Ace the</span>
            <span className="block text-zinc-500">Interview.</span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={2}
            className="mx-auto mt-8 max-w-xl text-base leading-relaxed text-zinc-400 sm:text-lg lg:mx-0"
          >
            Meet <span className="font-bold text-white">{BRAND.interviewer}</span>, your technical practice guide.
            Explain your reasoning and review evidence-grounded feedback with clear confidence labels.
          </motion.p>

          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={3}
            className="mx-auto mt-10 flex w-full max-w-xl flex-col gap-4 sm:flex-row lg:mx-0"
          >
            <Link
              to="/register"
              className="flex-1 rounded-xl bg-white px-8 py-3.5 text-center text-[15px] font-bold text-black transition-all hover:bg-zinc-200 active:scale-[0.98] shadow-[0_0_30px_rgba(255,255,255,0.12)]"
            >
              Start Practicing Free
            </Link>
            <a
              href="#features"
              className="flex-1 rounded-xl border border-white/15 px-8 py-3.5 text-center text-[15px] font-bold text-white transition-all hover:bg-white/5 active:scale-[0.98]"
            >
              See How It Works
            </a>
          </motion.div>

          <motion.ul
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={4}
            className="mt-12 flex flex-wrap items-center justify-center gap-x-7 gap-y-2 font-mono text-[13px] tracking-wide text-zinc-600 lg:justify-start"
          >
            {["Voice Interviews", "Live Coding", "Whiteboarding", "Resume Reports", "Report Cards"].map((t) => (
              <li key={t} className="transition-colors hover:text-zinc-400">
                {t}
              </li>
            ))}
          </motion.ul>
        </div>

        {/* Right — 3D floating interview card with a LIVE Lyra */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="relative mx-auto w-full max-w-md"
        >
          <TiltCard>
            <div className="hero-float relative rounded-[2rem] border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-8 backdrop-blur-xl shadow-[0_40px_120px_rgba(0,0,0,0.7)]">
              {/* Window chrome: dots + live session status */}
              <div className="mb-6 flex items-center justify-between">
                <div className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-500/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 rounded-full border border-rose-500/25 bg-rose-500/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-rose-400">
                    <span className="live-dot h-1.5 w-1.5 rounded-full bg-rose-500" />
                    Live
                  </span>
                  <span className="font-mono text-[11px] font-bold tabular-nums text-zinc-500">{clock}</span>
                </div>
              </div>

              <div className="flex flex-col items-center">
                {/* Glowing halo behind Lyra — brightens while she speaks */}
                <div className="relative">
                  <div
                    className={`ring-spin absolute -inset-2.5 rounded-full transition-opacity duration-700 ${speaking ? "opacity-100" : "opacity-35"}`}
                    style={{
                      background:
                        "conic-gradient(from 0deg, rgba(167,139,250,0.45), rgba(255,255,255,0.06), rgba(167,139,250,0.05), rgba(167,139,250,0.45))",
                      filter: "blur(10px)",
                    }}
                  />
                  <div className="relative">
                    <InterviewerAvatar speaking={speaking} amplitude={amplitude} size={170} />
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <p className="font-black text-white">{BRAND.interviewer}</p>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
                </div>
                <p className="text-[9px] font-black uppercase tracking-[0.25em] text-zinc-500">
                  AI Interviewer
                </p>

                {/* Status line with live voice bars */}
                <div className="mt-5 flex min-h-[3.4rem] w-full items-center gap-3.5 rounded-2xl border border-white/[0.06] bg-black/40 px-5 py-3">
                  <HeroWaveform amplitude={amplitude} active={speaking} />
                  <p className="text-left text-[13px] leading-relaxed text-zinc-300">
                    {speaking
                      ? "“You mentioned caching — what happens when it goes stale?”"
                      : "Listening to your answer…"}
                  </p>
                </div>

                {/* Call controls (decorative) */}
                <div className="mt-5 flex w-full items-center justify-center gap-3 border-t border-white/[0.05] pt-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-300">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" x2="12" y1="19" y2="22" />
                    </svg>
                  </span>
                  <span className="flex h-10 w-14 items-center justify-center rounded-full bg-rose-500/90 text-white shadow-[0_8px_24px_rgba(244,63,94,0.35)]">
                    <svg className="rotate-[135deg]" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                    </svg>
                  </span>
                  <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-300">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                    </svg>
                  </span>
                </div>
              </div>

              {/* Floating metric chips (3D depth) */}
              <div className="hero-chip absolute -left-8 top-24 rounded-2xl border border-white/10 bg-[#0c0c0e]/90 px-4 py-2.5 shadow-[0_16px_40px_rgba(0,0,0,0.6)] backdrop-blur-xl" style={{ transform: "translateZ(50px)" }}>
                <p className="text-[8px] font-black uppercase tracking-[0.2em] text-zinc-500">Technical</p>
                <p className="text-lg font-black text-emerald-400">92<span className="text-[10px] text-zinc-500">/100</span></p>
              </div>
              <div className="hero-chip absolute -right-6 top-44 rounded-2xl border border-white/10 bg-[#0c0c0e]/90 px-4 py-2.5 shadow-[0_16px_40px_rgba(0,0,0,0.6)] backdrop-blur-xl" style={{ transform: "translateZ(70px)", animationDelay: "-2s" }}>
                <p className="text-[8px] font-black uppercase tracking-[0.2em] text-zinc-500">Clarity</p>
                <p className="text-lg font-black text-white">96<span className="text-[10px] text-zinc-500">%</span></p>
              </div>
              <div className="hero-chip absolute -bottom-5 left-10 rounded-2xl border border-amber-500/20 bg-[#0c0c0e]/90 px-4 py-2.5 shadow-[0_16px_40px_rgba(0,0,0,0.6)] backdrop-blur-xl" style={{ transform: "translateZ(60px)", animationDelay: "-4s" }}>
                <p className="text-[10px] font-bold text-amber-400">⚡ Follow-up incoming…</p>
              </div>
            </div>
          </TiltCard>
        </motion.div>

        <motion.a
          href="#features"
          aria-label="Scroll down"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 lg:flex h-10 w-10 animate-bounce items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-zinc-400 hover:text-white"
        >
          <ChevronDown size={18} />
        </motion.a>
      </section>

      {/* ───────────────────────── Features ───────────────────────── */}
      <section id="features" className="relative z-10 mx-auto max-w-7xl px-4 py-28 sm:px-6 lg:px-8">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="mx-auto max-w-2xl text-center"
        >
          <p className="font-mono text-[13px] uppercase tracking-[0.3em] text-zinc-600">
            The Arsenal
          </p>
          <h2 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-5xl">
            Everything a real interview throws at you.
          </h2>
        </motion.div>

        <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" style={{ perspective: "1400px" }}>
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              custom={i}
              whileHover={{ rotateX: 4, rotateY: -4, scale: 1.02 }}
              transition={{ type: "spring", stiffness: 260, damping: 18 }}
              style={{ transformStyle: "preserve-3d" }}
              className="group relative rounded-2xl border border-white/[0.07] bg-white/[0.02] p-7 hover:border-white/20 hover:bg-white/[0.04] hover:shadow-[0_30px_60px_rgba(0,0,0,0.55)] overflow-hidden"
            >
              <span aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/[0.06] text-zinc-300 ring-1 ring-white/10 transition-all duration-300 group-hover:bg-white group-hover:text-black group-hover:shadow-[0_0_24px_rgba(255,255,255,0.25)]">
                <f.icon size={20} />
              </div>
              <h3 className="mt-5 text-lg font-bold text-white">{f.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-zinc-500">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ───────────────────────── How it works ───────────────────────── */}
      <section id="how-it-works" className="relative z-10 border-t border-white/5">
        <div className="mx-auto max-w-7xl px-4 py-28 sm:px-6 lg:px-8">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            className="mx-auto max-w-2xl text-center"
          >
            <p className="font-mono text-[13px] uppercase tracking-[0.3em] text-zinc-600">
              The Loop
            </p>
            <h2 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-5xl">
              Three steps. Zero mercy.
            </h2>
          </motion.div>

          <div className="mt-16 grid gap-10 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <motion.div
                key={s.step}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-60px" }}
                custom={i}
                className="relative"
              >
                <span className="bg-gradient-to-b from-white/50 to-white/10 bg-clip-text text-6xl font-black text-transparent">{s.step}</span>
                <h3 className="mt-3 text-xl font-bold text-white">{s.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-zinc-500">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────────────────── CTA band ───────────────────────── */}
      <section className="relative z-10 border-t border-white/5 overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[70%]"
          style={{ background: "radial-gradient(ellipse 55% 70% at 50% 100%, rgba(255,255,255,0.06), transparent 70%)" }}
        />
        <div className="mx-auto max-w-4xl px-4 py-28 text-center sm:px-6">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
          >
            <Zap className="mx-auto text-zinc-600" size={28} />
            <h2 className="mt-6 text-4xl font-black tracking-tight text-white sm:text-6xl">
              Your interviewer is
              <span className="block text-zinc-500">already waiting.</span>
            </h2>
            <p className="mx-auto mt-6 max-w-md text-zinc-400">
              Free to start. No credit card. Just you against the machine.
            </p>
            <Link
              to="/register"
              className="mt-10 inline-flex items-center gap-2 rounded-xl bg-white px-10 py-4 text-[15px] font-bold text-black transition-all hover:bg-zinc-200 active:scale-[0.98] shadow-[0_0_40px_rgba(255,255,255,0.15)]"
            >
              Start Your First Interview
              <ArrowRight size={17} />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ───────────────────────── Footer ───────────────────────── */}
      <footer className="relative z-10 border-t border-white/[0.06] bg-black/40">
        <div className="mx-auto max-w-7xl px-4 pt-16 pb-8 sm:px-6 lg:px-8">
          <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-2.5">
                <AptlyraMark className="h-9 w-9" />
                <span className="text-xl font-extrabold tracking-tight text-white">{BRAND.name}</span>
              </div>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-zinc-500">
                {BRAND.positioning}
              </p>
              <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">
                  All systems live
                </span>
              </div>
            </div>

            {/* Product */}
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.25em] text-zinc-600">Product</p>
              <ul className="mt-5 space-y-3 text-sm">
                <li><a href="#features" className="text-zinc-400 transition-colors hover:text-white">Features</a></li>
                <li><a href="#how-it-works" className="text-zinc-400 transition-colors hover:text-white">How It Works</a></li>
                <li><Link to="/register" className="text-zinc-400 transition-colors hover:text-white">Start Free</Link></li>
                <li><Link to="/login" className="text-zinc-400 transition-colors hover:text-white">Log In</Link></li>
              </ul>
            </div>

            {/* Platform */}
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.25em] text-zinc-600">Platform</p>
              <ul className="mt-5 space-y-3 text-sm">
                <li><Link to="/dashboard" className="text-zinc-400 transition-colors hover:text-white">Interview Dashboard</Link></li>
                <li><Link to="/resume-analyzer" className="text-zinc-400 transition-colors hover:text-white">Resume Analyzer</Link></li>
                <li><Link to="/analytics" className="text-zinc-400 transition-colors hover:text-white">Performance Analytics</Link></li>
              </ul>
            </div>

            {/* Get started */}
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.25em] text-zinc-600">Ready?</p>
              <p className="mt-5 text-sm leading-relaxed text-zinc-500">
                Preview your practice plan before you begin.
              </p>
              <Link
                to="/register"
                className="mt-5 inline-block rounded-xl bg-white px-6 py-2.5 text-sm font-bold text-black transition-all hover:bg-zinc-200 active:scale-[0.98]"
              >
                Create Account
              </Link>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-white/[0.06] pt-8 sm:flex-row">
            <p className="text-xs text-zinc-600">
              © {new Date().getFullYear()} {BRAND.name}. All rights reserved.
            </p>
            <p className="text-xs text-zinc-600">
              Built for the next generation of talent. 🎙️
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
