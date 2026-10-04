/**
 * @file components/EntityExtractionTab.tsx
 * @description
 * ARCHITECTURE OVERVIEW:
 * This component visualizes the structured JSON output returned from the AI Resume Parser.
 * It provides a fully editable UI where users can tweak the extracted fields (Name, Skills, Experience)
 * before generating the final ATS-optimized PDF. 
 * It also handles the "AI Bullet Rewrite" feature by bridging user input to the backend LLM service.
 */
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "react-toastify";
import { PDFDownloadLink } from "@react-pdf/renderer";
import type { ResumeData, ParsedProfile } from "../types";
import { ResumePDF } from "./ResumePDF";

interface EntityExtractionTabProps {
  resumeData: ResumeData;
  profile?: ParsedProfile;
  summary?: string;
  skills?: { technical?: string[]; soft?: string[] };
  personalInfo?: ParsedProfile["personal_info"];
  experience?: ParsedProfile["experience"];
  education?: ParsedProfile["education"];
}

export const EntityExtractionTab = ({
  resumeData,
  summary,
  skills,
  personalInfo,
  experience = [],
  education = [],
  profile,
}: EntityExtractionTabProps) => {
  const [rewritingBullet, setRewritingBullet] = useState<{ bullet: string; expIndex: number; bulletIndex: number } | null>(null);
  const [variations, setVariations] = useState<string[] | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editedProfile, setEditedProfile] = useState<ParsedProfile & { skills?: { technical?: string[]; soft?: string[] } }>(() => ({
    ...(profile || resumeData.parsedData?.parsedProfile || {}),
    personal_info: personalInfo || profile?.personal_info || {},
    summary: summary || profile?.summary || "",
    experience: experience.length ? experience : profile?.experience || [],
    education: education.length ? education : profile?.education || [],
    skills: skills || { technical: [], soft: [] }
  }));

  const handleRewrite = async (bullet: string, expIndex: number, bulletIndex: number) => {
    if (!resumeData._id) return;
    try {
      setRewritingBullet({ bullet, expIndex, bulletIndex });
      setVariations(null);

      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
      const response = await fetch(`${apiUrl}/resume/${resumeData._id}/rewrite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ bullet })
      });

      if (!response.ok || !response.body) {
        throw new Error("Error rewriting bullet point");
      }

      setVariations([]); // Set to empty array to reveal UI
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");

      let done = false;
      let text = "";

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          text += chunk;

          // Split by blank lines or standard markdown lists
          const parsed = text
            .replace(/^\d+\.\s*/gm, "") // remove "1. ", "2. "
            .replace(/^-\s*/gm, "") // remove "- "
            .replace(/^\*\s*/gm, "") // remove "* "
            .split(/\n\s*\n/)
            .map(s => s.trim())
            .filter(Boolean);

          setVariations(parsed.length > 0 ? parsed : [text]);
        }
      }

    } catch (error) {
      toast.error("Error rewriting bullet point");
      console.error(error);
      setRewritingBullet(null);
    }
  };

  const applyVariation = (variation: string) => {
    if (!rewritingBullet) return;

    setEditedProfile(prev => {
      const newExp = [...(prev.experience || [])];
      const targetExp = { ...newExp[rewritingBullet.expIndex] };
      const bullets = (targetExp.description || "").split(/(?:\n|•)/).filter(b => b.trim().length > 3);
      bullets[rewritingBullet.bulletIndex] = variation;
      targetExp.description = bullets.map(b => `• ${b.trim()}`).join('\n');
      newExp[rewritingBullet.expIndex] = targetExp;
      return { ...prev, experience: newExp };
    });

    toast.success("Applied to experience section!");
    setRewritingBullet(null);
    setVariations(null);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  };

  // Generate dynamic industry scores based on raw text keyword matching
  const allText = (resumeData.parsedData?.rawText || "").toLowerCase();
  const industries = [
    { name: "Software Engineering", keywords: ["react", "node", "software", "developer", "python", "java", "code", "engineering", "api", "database", "sql"] },
    { name: "UI/UX Design", keywords: ["design", "figma", "ui", "ux", "user interface", "user experience", "wireframe", "prototype"] },
    { name: "Product Management", keywords: ["product", "agile", "scrum", "roadmap", "strategy", "stakeholder", "management", "lifecycle"] },
    { name: "Data Science", keywords: ["data", "machine learning", "ai", "analysis", "sql", "model", "python", "statistics"] },
    { name: "Cloud / DevOps", keywords: ["aws", "docker", "kubernetes", "ci/cd", "cloud", "azure", "deployment", "infrastructure", "devops"] },
    { name: "Cybersecurity", keywords: ["security", "penetration", "vulnerability", "firewall", "auth", "encryption", "threat"] },
  ];

  const industryScores = industries.map(ind => ({
    name: ind.name,
    score: ind.keywords.reduce((count, kw) => count + (allText.match(new RegExp(`\\b${kw}\\b`, 'g'))?.length || 0), 0)
  })).filter(ind => ind.score > 0).sort((a, b) => b.score - a.score);

  if (industryScores.length === 0) {
    industryScores.push({ name: "General/Other", score: 1 });
  }

  const primaryIndustry = industryScores[0];
  const secondaryIndustry = industryScores.length > 1 ? industryScores[1] : null;
  const maxIndScore = Math.max(...industryScores.map(i => i.score));

  return (
    <motion.div
      key="extraction"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-8"
    >
      {/* Top Actions */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center glass-card p-5 rounded-3xl">
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <button
            onClick={() => setIsEditing(!isEditing)}
            className={`w-full sm:w-auto px-6 py-3 sm:py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors cursor-pointer text-center ${isEditing ? "bg-primary-500 text-white shadow-lg shadow-primary-500/20" : "bg-surface-700/50 text-surface-300 hover:bg-surface-600 hover:text-white"
              }`}
          >
            {isEditing ? "Done Editing" : "Edit Mode"}
          </button>
        </div>

        <PDFDownloadLink
          document={<ResumePDF profile={editedProfile} />}
          fileName="Optimized_Resume.pdf"
          className="w-full sm:w-auto px-6 py-3 sm:py-2 bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/50 text-indigo-300 rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/10"
        >
          {({ loading }) => (loading ? "Preparing PDF..." : "Download ATS PDF")}
        </PDFDownloadLink>
      </div>

      {/* Profile Summary */}
      {editedProfile.summary !== undefined && (
        <section className="glass-card rounded-3xl p-8">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-primary-400 mb-4">
            Profile Summary
          </h3>
          {isEditing ? (
            <textarea
              className="w-full bg-surface-900/50 border border-surface-600/50 rounded-xl p-4 text-sm text-white focus:outline-hidden focus:border-primary-500 min-h-[100px]"
              value={editedProfile.summary}
              onChange={(e) => setEditedProfile(p => ({ ...p, summary: e.target.value }))}
            />
          ) : (
            <p className="text-sm text-surface-200 font-medium leading-relaxed">{editedProfile.summary}</p>
          )}
        </section>
      )}

      {/* Detected Industry & Role */}
      <section>
        <h3 className="text-xs font-black tracking-widest text-surface-400 uppercase mb-4 ml-1">Detected Industry & Role</h3>

        {/* Primary Industry Card */}
        <div className="glass-card rounded-3xl p-6 sm:p-10 flex flex-col items-center justify-center mb-6 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-linear-to-b from-indigo-500/5 to-transparent pointer-events-none" />
          <span className="text-[10px] font-black uppercase tracking-widest text-surface-500 mb-3 relative z-10">PRIMARY INDUSTRY</span>
          <h2 className="text-2xl sm:text-4xl font-black text-indigo-400 mb-4 relative z-10 font-display">{primaryIndustry.name}</h2>
          <span className="px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-black uppercase tracking-widest whitespace-nowrap relative z-10 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
            High confidence
          </span>
        </div>

        {/* Secondary Industry & Scores */}
        <div className="glass-card rounded-3xl p-8 space-y-6">
          {secondaryIndustry && (
            <div className="flex items-center gap-3 pb-6 border-b border-white/[0.06]">
              <span className="text-[11px] font-black uppercase tracking-widest text-surface-400">Secondary:</span>
              <span className="text-[13px] font-bold text-surface-200">{secondaryIndustry.name}</span>
            </div>
          )}

          <div>
            <h4 className="text-sm font-bold text-white mb-6">Industry Scores</h4>
            <div className="space-y-4">
              {industryScores.map((ind, i) => (
                <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  <span className="w-full sm:w-40 text-xs font-medium text-surface-300 truncate" title={ind.name}>{ind.name}</span>
                  <div className="flex items-center gap-4 w-full sm:flex-1">
                    <div className="flex-1 h-1.5 bg-surface-700/50 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-linear-to-r from-indigo-500 to-primary-400 rounded-full"
                        style={{ width: `${(ind.score / maxIndScore) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-xs text-surface-400">{ind.score.toFixed(1)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Contact Information */}
      <section>
        <h3 className="text-xs font-black tracking-widest text-surface-400 uppercase mb-4 ml-1">Contact Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="glass-card rounded-2xl p-6 shadow-lg shadow-black/20">
            <span className="text-[10px] font-black uppercase tracking-widest text-surface-500 mb-3 block">NAME</span>
            {isEditing ? (
              <input
                className="w-full bg-surface-900/50 border border-surface-600/50 rounded-xl p-3 text-sm text-white font-bold"
                value={editedProfile.personal_info?.name || ""}
                onChange={(e) => setEditedProfile(p => ({ ...p, personal_info: { ...p.personal_info, name: e.target.value } }))}
              />
            ) : (
              <p className="text-lg text-white font-black font-display">{editedProfile.personal_info?.name || "Not Found"}</p>
            )}
          </div>
          <div className="glass-card rounded-2xl p-6 shadow-lg shadow-black/20">
            <span className="text-[10px] font-black uppercase tracking-widest text-surface-500 mb-3 block">EMAIL</span>
            {isEditing ? (
              <input
                className="w-full bg-surface-900/50 border border-surface-600/50 rounded-xl p-3 text-sm text-white font-bold"
                value={editedProfile.personal_info?.email || ""}
                onChange={(e) => setEditedProfile(p => ({ ...p, personal_info: { ...p.personal_info, email: e.target.value } }))}
              />
            ) : (
              <p className="text-[13px] text-surface-200 font-medium break-all">{editedProfile.personal_info?.email || "Not Found"}</p>
            )}
          </div>
          <div className="glass-card rounded-2xl p-6 shadow-lg shadow-black/20">
            <span className="text-[10px] font-black uppercase tracking-widest text-surface-500 mb-3 block">PHONE</span>
            {isEditing ? (
              <input
                className="w-full bg-surface-900/50 border border-surface-600/50 rounded-xl p-3 text-sm text-white font-bold"
                value={editedProfile.personal_info?.phone || ""}
                onChange={(e) => setEditedProfile(p => ({ ...p, personal_info: { ...p.personal_info, phone: e.target.value } }))}
              />
            ) : (
              <p className="text-[14.5px] text-surface-200 font-medium">{editedProfile.personal_info?.phone || "Not Found"}</p>
            )}
          </div>
        </div>

        {/* Links */}
        {isEditing ? (
          <div className="glass-card rounded-2xl p-6 mt-4 shadow-lg shadow-black/20">
            <span className="text-[10px] font-black uppercase tracking-widest text-surface-500 mb-3 block">LINKS (COMMA SEPARATED)</span>
            <input
              className="w-full bg-surface-900/50 border border-surface-600/50 rounded-xl p-3 text-sm text-white"
              value={editedProfile.personal_info?.links?.join(", ") || ""}
              onChange={(e) => setEditedProfile(p => ({
                ...p,
                personal_info: {
                  ...p.personal_info,
                  links: e.target.value.split(",").map(s => s.trim()).filter(Boolean)
                }
              }))}
              placeholder="https://github.com/..., https://linkedin.com/in/..."
            />
          </div>
        ) : (
          editedProfile.personal_info?.links && editedProfile.personal_info.links.length > 0 && (
            <div className="flex flex-wrap gap-4 mt-4">
              {(() => {
                const links = editedProfile.personal_info.links || [];

                // Find primary LinkedIn link
                const linkedinLink = links.find(link => link.toLowerCase().includes('linkedin.com'));

                // Find primary GitHub link (prioritize profile links over repo links)
                const githubLinks = links.filter(link => link.toLowerCase().includes('github.com'));
                let githubLink = githubLinks.find(link => {
                  try {
                    const urlStr = link.startsWith('http') ? link : `https://${link}`;
                    const urlObj = new URL(urlStr);
                    // Profile links typically have only 1 path segment (e.g., /ArnabDey)
                    return urlObj.pathname.split('/').filter(Boolean).length === 1;
                  } catch {
                    return false;
                  }
                });

                // Fallback to first GitHub link if no pure profile link is found
                if (!githubLink && githubLinks.length > 0) {
                  githubLink = githubLinks[0];
                }

                const displayLinks = [
                  githubLink ? { url: githubLink, type: 'github' } : null,
                  linkedinLink ? { url: linkedinLink, type: 'linkedin' } : null
                ].filter(Boolean) as { url: string, type: 'github' | 'linkedin' }[];

                return displayLinks.map((item, i) => (
                  <a
                    key={i}
                    href={item.url.startsWith('http') ? item.url : `https://${item.url}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 px-5 py-2.5 glass-card hover:border-primary-500/50 hover:bg-surface-800 rounded-xl transition-all shadow-lg shadow-black/20"
                  >
                    {item.type === 'github' && (
                      <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" /></svg>
                    )}
                    {item.type === 'linkedin' && (
                      <svg className="w-5 h-5 text-[#0A66C2]" fill="currentColor" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" /></svg>
                    )}
                    <span className="text-[13px] font-bold text-surface-200">
                      {item.type === 'github' ? "GitHub" : "LinkedIn"}
                    </span>
                  </a>
                ));
              })()}
            </div>
          )
        )}
      </section>

      {/* Technical Skills */}
      {editedProfile.skills?.technical && editedProfile.skills.technical.length > 0 && (
        <section>
          <h3 className="text-xs font-black tracking-widest text-surface-400 uppercase mb-4 ml-1">Technical Skills</h3>
          <div className="glass-card rounded-3xl p-8">
            {isEditing ? (
              <textarea
                className="w-full bg-surface-900/50 border border-surface-600/50 rounded-xl p-4 text-sm text-white focus:outline-hidden focus:border-primary-500 min-h-[80px]"
                value={editedProfile.skills.technical.join(", ")}
                onChange={(e) => setEditedProfile(p => ({
                  ...p,
                  skills: { ...p.skills, technical: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }
                }))}
              />
            ) : (
              <div className="flex flex-wrap gap-3">
                {editedProfile.skills.technical.map((s: string, i: number) => (
                  <span
                    key={i}
                    className="px-4 py-2 bg-indigo-500/10 border border-indigo-500/30 rounded-xl text-[13px] font-bold text-indigo-300 shadow-[0_0_15px_rgba(99,102,241,0.1)]"
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Extracted Keywords (Soft Skills / Others) */}
      {editedProfile.skills?.soft && editedProfile.skills.soft.length > 0 && (
        <section>
          <h3 className="text-xs font-black tracking-widest text-surface-400 uppercase mb-4 ml-1">Extracted Keywords</h3>
          <div className="glass-card rounded-3xl p-8">
            {isEditing ? (
              <textarea
                className="w-full bg-surface-900/50 border border-surface-600/50 rounded-xl p-4 text-sm text-white focus:outline-hidden focus:border-primary-500 min-h-[80px]"
                value={editedProfile.skills.soft.join(", ")}
                onChange={(e) => setEditedProfile(p => ({
                  ...p,
                  skills: { ...p.skills, soft: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }
                }))}
              />
            ) : (
              <div className="flex flex-wrap gap-3">
                {editedProfile.skills.soft.map((s: string, i: number) => (
                  <span
                    key={i}
                    className="px-4 py-2 bg-surface-800/50 border border-white/[0.06] rounded-xl text-[13px] font-bold text-surface-300 shadow-[0_0_15px_rgba(0,0,0,0.2)]"
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Work Experience */}
      {editedProfile.experience && editedProfile.experience.length > 0 && (
        <section>
          <h3 className="text-xs font-black tracking-widest text-surface-400 uppercase mb-4 ml-1">Work Experience</h3>
          <div className="space-y-6 relative before:absolute before:inset-0 before:ml-[31px] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-linear-to-b before:from-transparent before:via-surface-600 before:to-transparent z-10">
            {editedProfile.experience.map((exp, i) => (
              <div
                key={i}
                className="relative glass-card rounded-3xl p-8"
              >
                <div className="flex flex-col sm:flex-row items-start sm:justify-between gap-4">
                  <div className="min-w-0 flex-1 w-full order-2 sm:order-1">
                    {isEditing ? (
                      <div className="space-y-2 mb-3">
                        <input
                          type="text"
                          className="w-full bg-surface-900/50 border border-surface-600/50 rounded-xl p-3 text-sm font-bold text-white"
                          value={exp.role || exp.title || ""}
                          onChange={(e) => {
                            const newExp = [...editedProfile.experience!];
                            newExp[i] = { ...newExp[i], role: e.target.value };
                            setEditedProfile(p => ({ ...p, experience: newExp }));
                          }}
                          placeholder="Role / Title"
                        />
                        <div className="flex gap-2">
                          <input
                            type="text"
                            className="flex-1 bg-surface-900/50 border border-surface-600/50 rounded-xl p-3 text-sm text-primary-400 font-bold"
                            value={exp.company || ""}
                            onChange={(e) => {
                              const newExp = [...editedProfile.experience!];
                              newExp[i] = { ...newExp[i], company: e.target.value };
                              setEditedProfile(p => ({ ...p, experience: newExp }));
                            }}
                            placeholder="Company"
                          />
                          <input
                            type="text"
                            className="flex-1 bg-surface-900/50 border border-surface-600/50 rounded-xl p-3 text-sm text-surface-400"
                            value={exp.duration || ""}
                            onChange={(e) => {
                              const newExp = [...editedProfile.experience!];
                              newExp[i] = { ...newExp[i], duration: e.target.value };
                              setEditedProfile(p => ({ ...p, experience: newExp }));
                            }}
                            placeholder="Duration (e.g. Jan 2020 - Present)"
                          />
                        </div>
                        <textarea
                          className="w-full bg-surface-900/50 border border-surface-600/50 rounded-xl p-3 text-sm text-surface-300 min-h-[100px]"
                          value={exp.description || ""}
                          onChange={(e) => {
                            const newExp = [...editedProfile.experience!];
                            newExp[i] = { ...newExp[i], description: e.target.value };
                            setEditedProfile(p => ({ ...p, experience: newExp }));
                          }}
                          placeholder="Bullet points"
                        />
                      </div>
                    ) : (
                      <>
                        <h4 className="text-xl font-black text-white font-display">
                          {exp.role || exp.title || "Role"}
                        </h4>
                        {exp.company && (
                          <p className="text-[13px] text-primary-400 font-bold mt-2 mb-1">{exp.company}</p>
                        )}
                        {exp.location && (
                          <p className="text-[11px] font-bold uppercase tracking-widest text-surface-500">{exp.location}</p>
                        )}
                        {exp.description && (
                          <ul className="mt-6 space-y-3">
                            {exp.description.split(/(?:\n|•)/).filter(b => b.trim().length > 3).map((bullet, idx) => (
                              <li key={idx} className="group flex flex-col sm:flex-row items-start gap-3 text-[14.5px] text-surface-300 font-medium leading-relaxed hover:text-surface-100 transition-colors">
                                <div className="flex items-start gap-3 w-full">
                                  <Sparkles className="w-4 h-4 text-primary-500 mt-1 shrink-0" />
                                  <span className="flex-1">{bullet.trim()}</span>
                                </div>
                                <button
                                  onClick={() => handleRewrite(bullet.trim(), i, idx)}
                                  className="opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity bg-primary-500/20 hover:bg-primary-500/40 text-primary-400 rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-widest shrink-0 sm:ml-2 mt-2 sm:mt-0 self-end sm:self-auto cursor-pointer shadow-[0_0_15px_rgba(167,139,250,0.1)]"
                                >
                                  Rewrite
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </div>
                  {!isEditing && exp.duration && (
                    <span className="text-[10px] font-black tracking-widest text-surface-400 uppercase bg-surface-800/50 rounded-full px-3 py-1.5 whitespace-nowrap shrink-0 border border-white/[0.06] order-1 sm:order-2 mb-2 sm:mb-0 shadow-inner shadow-black/20">
                      {exp.duration}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Projects */}
      {editedProfile.projects && editedProfile.projects.length > 0 && (
        <section>
          <h3 className="text-xs font-black tracking-widest text-surface-400 uppercase mb-4 ml-1">Projects</h3>
          <div className="space-y-6 relative before:absolute before:inset-0 before:ml-[31px] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-linear-to-b before:from-transparent before:via-surface-600 before:to-transparent z-10">
            {editedProfile.projects.map((proj, i) => (
              <div
                key={i}
                className="relative bg-surface-800/40 border border-emerald-500/20 rounded-3xl p-8 shadow-2xl shadow-black/40 backdrop-blur-md"
              >
                <div className="flex flex-col sm:flex-row items-start sm:justify-between gap-4">
                  <div className="min-w-0 flex-1 w-full order-2 sm:order-1">
                    {isEditing ? (
                      <div className="space-y-2 mb-3">
                        <input
                          type="text"
                          className="w-full bg-surface-900/50 border border-surface-600/50 rounded-xl p-3 text-sm font-bold text-white"
                          value={proj.title || ""}
                          onChange={(e) => {
                            const newProj = [...editedProfile.projects!];
                            newProj[i] = { ...newProj[i], title: e.target.value };
                            setEditedProfile(p => ({ ...p, projects: newProj }));
                          }}
                          placeholder="Project Title"
                        />
                        <div className="flex gap-2">
                          <input
                            type="text"
                            className="flex-1 bg-surface-900/50 border border-surface-600/50 rounded-xl p-3 text-sm text-emerald-400 font-bold"
                            value={proj.link || ""}
                            onChange={(e) => {
                              const newProj = [...editedProfile.projects!];
                              newProj[i] = { ...newProj[i], link: e.target.value };
                              setEditedProfile(p => ({ ...p, projects: newProj }));
                            }}
                            placeholder="Link URL"
                          />
                          <input
                            type="text"
                            className="flex-1 bg-surface-900/50 border border-surface-600/50 rounded-xl p-3 text-sm text-surface-400"
                            value={proj.duration || ""}
                            onChange={(e) => {
                              const newProj = [...editedProfile.projects!];
                              newProj[i] = { ...newProj[i], duration: e.target.value };
                              setEditedProfile(p => ({ ...p, projects: newProj }));
                            }}
                            placeholder="Duration"
                          />
                        </div>
                        <textarea
                          className="w-full bg-surface-900/50 border border-surface-600/50 rounded-xl p-3 text-sm text-surface-300 min-h-[100px]"
                          value={proj.description || ""}
                          onChange={(e) => {
                            const newProj = [...editedProfile.projects!];
                            newProj[i] = { ...newProj[i], description: e.target.value };
                            setEditedProfile(p => ({ ...p, projects: newProj }));
                          }}
                          placeholder="Project description / bullet points"
                        />
                      </div>
                    ) : (
                      <>
                        <h4 className="text-xl font-black text-white font-display">
                          {proj.title || "Project"}
                        </h4>
                        {proj.link && (
                          <a href={proj.link.startsWith('http') ? proj.link : `https://${proj.link}`} target="_blank" rel="noreferrer" className="text-[13px] text-emerald-400 font-bold mt-2 mb-1 block hover:underline truncate">
                            {proj.link}
                          </a>
                        )}
                        {proj.description && (
                          <ul className="mt-6 space-y-3">
                            {proj.description.split(/(?:\n|•)/).filter(b => b.trim().length > 3).map((bullet, idx) => (
                              <li key={idx} className="group flex items-start gap-3 text-[14.5px] text-surface-300 font-medium leading-relaxed hover:text-surface-100 transition-colors">
                                <Sparkles className="w-4 h-4 text-emerald-500 mt-1 shrink-0" />
                                <span className="flex-1">{bullet.trim()}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </div>
                  {!isEditing && proj.duration && (
                    <span className="text-[10px] font-black tracking-widest text-surface-400 uppercase bg-surface-800/50 rounded-full px-3 py-1.5 whitespace-nowrap shrink-0 border border-white/[0.06] order-1 sm:order-2 mb-2 sm:mb-0 shadow-inner shadow-black/20">
                      {proj.duration}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Education */}
      {editedProfile.education && editedProfile.education.length > 0 && (
        <section className="pb-8">
          <h3 className="text-xs font-black tracking-widest text-surface-400 uppercase mb-4 ml-1">Education</h3>
          <div className="space-y-6">
            {editedProfile.education.map((edu, i) => (
              <div
                key={i}
                className="bg-surface-800/40 border border-indigo-500/20 rounded-3xl p-8 shadow-2xl shadow-black/40 backdrop-blur-md relative overflow-hidden"
              >
                <div className="absolute left-0 top-0 bottom-0 w-2 bg-indigo-500/50" />
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <div className="space-y-2 mb-3">
                        <input
                          type="text"
                          className="w-full bg-surface-900/50 border border-surface-600/50 rounded-xl p-3 text-sm font-bold text-white"
                          value={edu.institution || edu.school || ""}
                          onChange={(e) => {
                            const newEdu = [...editedProfile.education!];
                            newEdu[i] = { ...newEdu[i], institution: e.target.value };
                            setEditedProfile(p => ({ ...p, education: newEdu }));
                          }}
                          placeholder="Institution / School"
                        />
                        <div className="flex gap-2">
                          <input
                            type="text"
                            className="flex-1 bg-surface-900/50 border border-surface-600/50 rounded-xl p-3 text-sm text-indigo-400 font-bold"
                            value={edu.degree || ""}
                            onChange={(e) => {
                              const newEdu = [...editedProfile.education!];
                              newEdu[i] = { ...newEdu[i], degree: e.target.value };
                              setEditedProfile(p => ({ ...p, education: newEdu }));
                            }}
                            placeholder="Degree"
                          />
                          <input
                            type="text"
                            className="flex-1 bg-surface-900/50 border border-surface-600/50 rounded-xl p-3 text-sm text-surface-400"
                            value={edu.year || ""}
                            onChange={(e) => {
                              const newEdu = [...editedProfile.education!];
                              newEdu[i] = { ...newEdu[i], year: e.target.value };
                              setEditedProfile(p => ({ ...p, education: newEdu }));
                            }}
                            placeholder="Year"
                          />
                        </div>
                      </div>
                    ) : (
                      <>
                        <h4 className="text-xl font-black text-white font-display">
                          {edu.institution || edu.school || "School"}
                        </h4>
                        {(edu.degree || edu.field) && (
                          <p className="text-[13px] text-indigo-400 font-bold mt-2 mb-1">
                            {edu.degree} {edu.field ? `in ${edu.field}` : ""}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                  {!isEditing && edu.year && (
                    <span className="text-[10px] font-black tracking-widest text-surface-400 uppercase bg-surface-800/50 rounded-full px-3 py-1.5 whitespace-nowrap shrink-0 border border-white/[0.06] shadow-inner shadow-black/20">
                      {edu.year}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* AI Rewrite Modal */}
      <AnimatePresence>
        {rewritingBullet && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-900/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-surface-800 border border-primary-500/30 rounded-2xl p-6 max-w-2xl w-full shadow-2xl relative max-h-[90vh] overflow-y-auto"
            >
              <button
                onClick={() => { setRewritingBullet(null); setVariations(null); }}
                className="absolute top-4 right-4 text-surface-500 hover:text-white"
              >
                ✕
              </button>

              <h3 className="text-lg font-black text-white flex items-center gap-2 mb-2">
                <Sparkles className="w-5 h-5 text-primary-400" /> AI STAR Rewriter
              </h3>
              <p className="text-xs text-surface-400 mb-6 font-medium uppercase tracking-widest">
                Situation • Task • Action • Result
              </p>

              <div className="mb-6 p-4 bg-surface-900/50 rounded-xl border border-white/5">
                <span className="text-[10px] text-surface-500 font-bold uppercase tracking-widest block mb-2">Original</span>
                <p className="text-sm text-surface-300">{rewritingBullet.bullet}</p>
              </div>

              {!variations ? (
                <div className="flex flex-col items-center justify-center py-12 text-primary-400">
                  <Sparkles className="w-8 h-8 mb-4 animate-pulse" />
                  <p className="text-sm font-bold animate-pulse">Generating high-impact variations...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <span className="text-[10px] text-primary-400 font-bold uppercase tracking-widest block mb-2">Select a Variation</span>
                  {variations.map((v, i) => (
                    <div key={i} className="group relative p-4 bg-primary-500/5 hover:bg-primary-500/10 border border-primary-500/20 rounded-xl transition-colors">
                      <p className="text-sm text-surface-200 pr-32">{v}</p>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 flex gap-2 transition-opacity">
                        <button
                          onClick={() => copyToClipboard(v)}
                          className="bg-surface-600 hover:bg-surface-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors"
                        >
                          Copy
                        </button>
                        <button
                          onClick={() => applyVariation(v)}
                          className="bg-primary-500 hover:bg-primary-400 text-white px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-lg shadow-primary-500/20"
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
