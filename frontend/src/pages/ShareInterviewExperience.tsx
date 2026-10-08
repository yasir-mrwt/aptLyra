import { useEffect, useState, type FormEvent } from "react";
import axios from "axios";
import apiClient from "../services/apiClient";

const roles = ["Software Engineer", "Backend Developer", "Full Stack Developer"] as const;
type Submission = { id: string; state: string; created_at: string; expires_at: string; content_hash: string };

export default function ShareInterviewExperience() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [company, setCompany] = useState("");
  const [role, setRole] = useState<(typeof roles)[number]>(roles[0]);
  const [occurredOn, setOccurredOn] = useState("");
  const [roundType, setRoundType] = useState("");
  const [topics, setTopics] = useState("");
  const [questions, setQuestions] = useState("");
  const [notes, setNotes] = useState("");
  const [consent, setConsent] = useState(false);
  const [rightToShare, setRightToShare] = useState(false);
  const [anonymized, setAnonymized] = useState(false);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const response = await apiClient.get("/content-intelligence/submissions");
    setSubmissions(response.data);
  };
  useEffect(() => { void refresh().catch(() => setMessage("Your submissions could not be loaded.")); }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      await apiClient.post("/content-intelligence/submissions", {
        company: company.trim() || null, role, occurredOn: occurredOn || null, roundType: roundType.trim() || null,
        topics: topics.split("\n").map(s => s.trim()).filter(Boolean), questions: questions.split("\n").map(s => s.trim()).filter(Boolean),
        notes: notes.trim() || null, practiceConsent: consent, rightToShare, anonymizedResearchConsent: anonymized, aiProcessingConsent: aiProcessing,
      });
      setCompany(""); setOccurredOn(""); setRoundType(""); setTopics(""); setQuestions(""); setNotes("");
      setConsent(false); setRightToShare(false); setAnonymized(false); setAiProcessing(false);
      setMessage("Submitted for review. It is quarantined and will not be used in interview plans before review.");
      await refresh();
    } catch (error: unknown) {
      const serverMessage = axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message : undefined;
      setMessage(serverMessage || "The submission could not be saved. Remove personal or confidential details and try again.");
    } finally { setBusy(false); }
  };

  const withdraw = async (id: string) => {
    try { await apiClient.delete(`/content-intelligence/submissions/${id}`); await refresh(); setMessage("Submission withdrawn and removed from future use."); }
    catch { setMessage("This submission can no longer be withdrawn here."); }
  };

  return <section className="mx-auto max-w-3xl space-y-8 text-surface-100">
    <header><p className="text-sm uppercase tracking-wider text-cyan-300">Aptlyra community</p><h1 className="mt-2 text-3xl font-semibold">Share an interview experience</h1>
      <p className="mt-3 text-surface-300">Share only what you remember and have the right to share. Your submission is reviewed before it can influence practice plans.</p></header>
    <aside className="rounded-xl border border-amber-400/40 bg-amber-950/30 p-4 text-sm text-amber-100">Do not include confidential or proprietary interview material, private messages, or personal details about an interviewer or candidate. Company names are treated as unverified self-reports.</aside>
    <form onSubmit={submit} className="space-y-5 rounded-2xl border border-white/10 bg-slate-900/70 p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm">Company (optional)<input value={company} onChange={e => setCompany(e.target.value)} maxLength={200} className="w-full rounded-lg bg-slate-800 p-3" /></label>
        <label className="space-y-1 text-sm">Role<select value={role} onChange={e => setRole(e.target.value as typeof role)} className="w-full rounded-lg bg-slate-800 p-3">{roles.map(item => <option key={item}>{item}</option>)}</select></label>
        <label className="space-y-1 text-sm">Approximate date<input type="date" value={occurredOn} onChange={e => setOccurredOn(e.target.value)} className="w-full rounded-lg bg-slate-800 p-3" /></label>
        <label className="space-y-1 text-sm">Round or type (optional)<input value={roundType} onChange={e => setRoundType(e.target.value)} maxLength={100} className="w-full rounded-lg bg-slate-800 p-3" /></label>
      </div>
      <label className="block space-y-1 text-sm">Topics remembered, one per line<textarea value={topics} onChange={e => setTopics(e.target.value)} rows={3} maxLength={2500} className="w-full rounded-lg bg-slate-800 p-3" /></label>
      <label className="block space-y-1 text-sm">Questions remembered, one per line<textarea value={questions} onChange={e => setQuestions(e.target.value)} rows={4} maxLength={12000} className="w-full rounded-lg bg-slate-800 p-3" /></label>
      <label className="block space-y-1 text-sm">Optional notes<textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} maxLength={4000} className="w-full rounded-lg bg-slate-800 p-3" /></label>
      <div className="space-y-3 text-sm">
        <label className="flex gap-3"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />I consent to use this submission to create Aptlyra interview practice material.</label>
        <label className="flex gap-3"><input type="checkbox" checked={rightToShare} onChange={e => setRightToShare(e.target.checked)} />I have the right to share the information I submitted.</label>
        <label className="flex gap-3"><input type="checkbox" checked={anonymized} onChange={e => setAnonymized(e.target.checked)} />I optionally consent to anonymized aggregate research use.</label>
        <label className="flex gap-3"><input type="checkbox" checked={aiProcessing} onChange={e => setAiProcessing(e.target.checked)} />I optionally consent to AI-assisted question proposals. A human reviewer must approve every question.</label>
      </div>
      {message && <p role="status" className="text-sm text-cyan-200">{message}</p>}
      <button disabled={busy || !consent || !rightToShare} className="rounded-lg bg-cyan-500 px-5 py-3 font-medium text-slate-950 disabled:opacity-40">{busy ? "Submitting…" : "Submit for review"}</button>
    </form>
    <section><h2 className="text-xl font-semibold">Your submissions</h2><ul className="mt-3 space-y-3">{submissions.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-4 text-sm"><span>{item.state.replaceAll("_", " ")} · {new Date(item.created_at).toLocaleDateString()}</span>{["review_required", "quarantined"].includes(item.state) && <button onClick={() => void withdraw(item.id)} className="text-cyan-300 underline">Withdraw</button>}</li>)}</ul></section>
  </section>;
}
