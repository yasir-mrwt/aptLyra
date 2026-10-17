import {useEffect,useState} from "react";
import PracticeLeaderboard from "../components/PracticeLeaderboard";
import api from "../services/apiClient";
import type {GamificationProfile} from "../types/gamification";
import {ACHIEVEMENTS} from "../config/achievements";
type Activity={days:string[];currentStreak:number;longestStreak:number;timezone:string};
type Profile=GamificationProfile&{currentLevelXp:number;nextLevelXp:number};
export default function Rank(){
 const [data,setData]=useState<{profile:Profile;activity:Activity}|null>(null),[error,setError]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let alive=true;Promise.all([api.get('/gamification/profile'),api.get('/gamification/activity')]).then(([p,a])=>{if(alive){setData({profile:p.data,activity:a.data});setError(false);}}).catch(()=>{if(alive)setError(true);});return()=>{alive=false;};},[attempt]);
 if(error)return <section><h1>Practice progress</h1><p role="alert">Your progress could not be loaded. <button onClick={()=>setAttempt(n=>n+1)}>Retry</button></p></section>;
 if(!data)return <p role="status">Loading practice progress…</p>;
 const {profile,activity}=data,span=profile.nextLevelXp-profile.currentLevelXp;
 const progress=span>0?Math.max(0,Math.min(100,(profile.xp-profile.currentLevelXp)*100/span)):100;
 const today=new Date(),days=Array.from({length:84},(_,i)=>new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate()-83+i)).toISOString().slice(0,10));
 return <section className="product-workspace space-y-7 max-w-5xl mx-auto"><header><p className="home-eyebrow">YOUR PRACTICE RECORD</p><h1 className="text-4xl text-white font-semibold">Rank & practice progress</h1><p className="mt-3">Build consistency. XP and levels reflect participation, not a verified skill rank.</p></header>
 <div className="grid gap-4 sm:grid-cols-3"><article className="glass-card p-6"><h2>Level {profile.level}</h2><p>{profile.title}</p><p>{profile.xp} XP</p><progress aria-label="Progress to next level" className="w-full" value={progress} max={100}/><p>{Math.max(0,profile.nextLevelXp-profile.xp)} XP to next level</p></article><article className="glass-card p-6"><h2>Current practice streak</h2><p className="text-3xl">{activity.currentStreak} days</p></article><article className="glass-card p-6"><h2>Longest retained streak</h2><p className="text-3xl">{activity.longestStreak} days</p></article></div>
 <section className="glass-card p-6"><h2 className="text-xl">Practice calendar · last 12 weeks</h2><p>Completed interviews only, by UTC date. Removing interviews changes this retained-history calendar.</p><ul className="grid grid-cols-7 sm:grid-cols-14 gap-2 mt-4" aria-label="Practice days">{days.map(day=>{const practiced=activity.days.includes(day);return <li key={day} title={`${day}: ${practiced?'Interview completed':'No completed interview'}`} aria-label={`${day}: ${practiced?'Interview completed':'No completed interview'}`} className={`aspect-square rounded flex items-center justify-center text-xs ${practiced?'bg-cyan-800 text-white':'bg-white/5 text-surface-400'}`}>{day.slice(8)}</li>;})}</ul></section>
 <section className="glass-card p-6"><h2>Earned achievements</h2>{profile.badges.length?<ul>{profile.badges.map(b=><li key={b.badgeId}>{ACHIEVEMENTS.find(a=>a.id===b.badgeId)?.name||b.badgeId} · {new Date(b.earnedAt).toLocaleDateString()}</li>)}</ul>:<p>No achievements earned yet.</p>}</section>
 <PracticeLeaderboard/></section>;
}
