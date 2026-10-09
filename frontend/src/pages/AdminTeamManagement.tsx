import { useCallback, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "../app/store";
import { fetchCurrentRole } from "../features/auth/roleSlice";
import apiClient from "../services/apiClient";

type Role = "owner" | "admin" | "reviewer" | "user";
type Person = { id: string; name: string; email: string; role: Role; created_at?: string };

export default function AdminTeamManagement() {
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useSelector((state: RootState) => state.auth);
  const roleState = useSelector((state: RootState) => state.role);
  const currentUserId = user?.id || user?._id || "";
  const me = currentUserId && roleState.userId === currentUserId && roleState.status === "ready"
    ? { id: currentUserId, name: user?.name || "", email: user?.email || "", role: roleState.role as Role }
    : null;
  const [team, setTeam] = useState<Person[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [transferId, setTransferId] = useState("");
  const [transferConfirmation, setTransferConfirmation] = useState("");

  const load = useCallback(async () => {
    const members = await apiClient.get("/admin/team");
    setTeam(members.data);
  }, []);
  useEffect(() => { void load().catch(() => setMessage("Team management is available to owners and admins.")); }, [load]);

  const changeRole = async (person: Person, role: Role) => {
    setBusy(true); setMessage("");
    try {
      await apiClient.patch(`/admin/team/${person.id}/role`, { role });
      await load();
      await dispatch(fetchCurrentRole({ userId: currentUserId, force: true }));
      setMessage(`${person.email} is now ${role}.`);
    } catch (error) {
      const code = (error as { response?: { data?: { code?: string } } }).response?.data?.code;
      setMessage(code === "role-forbidden" ? "Your role cannot make that membership change." : "The role change could not be completed.");
    } finally { setBusy(false); }
  };

  const transfer = async () => {
    const target = team.find(person => person.id === transferId);
    if (!target || transferConfirmation.trim().toLowerCase() !== target.email.toLowerCase()) return;
    setBusy(true); setMessage("");
    try {
      await apiClient.post("/admin/owner/transfer", { targetUserId: target.id });
      setTransferId(""); setTransferConfirmation("");
      await load();
      await dispatch(fetchCurrentRole({ userId: currentUserId, force: true }));
      setMessage(`Ownership transferred to ${target.email}.`);
    } catch { setMessage("Ownership transfer could not be completed."); }
    finally { setBusy(false); }
  };

  const allowedRoles: Role[] = me?.role === "owner" ? ["admin", "reviewer", "user"] : ["reviewer", "user"];
  return <section className="mx-auto max-w-5xl space-y-6 text-surface-100">
    <header><p className="text-sm uppercase tracking-wider text-cyan-300">Protected administration</p><h1 className="mt-2 text-3xl font-semibold">Team and access</h1>
      <p className="mt-2 text-surface-300">Signed in as {me?.email || "…"} · role: <strong className="capitalize">{me?.role || "loading"}</strong></p></header>
    {message && <p role="status" className="rounded-lg border border-cyan-300/30 p-3 text-sm">{message}</p>}
    <div className="overflow-x-auto rounded-xl border border-white/15"><table className="w-full text-left text-sm"><thead className="bg-white/5 text-surface-300"><tr><th className="p-3">Account</th><th className="p-3">Role</th><th className="p-3">Change access</th></tr></thead>
      <tbody>{team.map(person => <tr key={person.id} className="border-t border-white/10"><td className="p-3"><div>{person.name}</div><div className="text-xs text-surface-400">{person.email}</div></td><td className="p-3 capitalize">{person.role}</td><td className="p-3">
        {person.role === "owner" || !me ? <span className="text-surface-500">Owner transfer only</span> : me.role === "admin" && !["user", "reviewer"].includes(person.role) ? <span className="text-surface-500">Owner changes this role</span> : <select aria-label={`Role for ${person.email}`} value={person.role} disabled={busy} onChange={event => void changeRole(person, event.target.value as Role)} className="rounded bg-slate-800 p-2">
          {[person.role, ...allowedRoles.filter(role => role !== person.role)].map(role => <option key={role} value={role}>{role === "user" ? "Remove editorial access" : `Set ${role}`}</option>)}
        </select>}
      </td></tr>)}</tbody></table></div>
    {me?.role === "owner" && <section className="space-y-3 rounded-xl border border-amber-300/25 p-4"><h2 className="text-lg font-semibold">Transfer ownership</h2><p className="text-sm text-surface-300">The selected account becomes owner and you become admin. This action is recorded in the role audit.</p>
      <select value={transferId} onChange={event => { setTransferId(event.target.value); setTransferConfirmation(""); }} className="w-full rounded bg-slate-800 p-2"><option value="">Choose a team account</option>{team.filter(person => person.id !== me.id).map(person => <option key={person.id} value={person.id}>{person.email} · {person.role}</option>)}</select>
      <input value={transferConfirmation} onChange={event => setTransferConfirmation(event.target.value)} placeholder="Type the selected account email to confirm" className="w-full rounded bg-slate-800 p-2" />
      <button type="button" disabled={busy || !transferId || transferConfirmation.toLowerCase() !== team.find(person => person.id === transferId)?.email.toLowerCase()} onClick={() => void transfer()} className="rounded border border-amber-300/40 px-4 py-2 text-sm disabled:opacity-40">Transfer ownership</button>
    </section>}
  </section>;
}
