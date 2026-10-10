import { ROOT_LABELS,shortageLabel,type PlanPreviewData } from "../planner/contracts";
import AIInterviewer from "./AIInterviewer";
export default function PlanPreview({plan,confirming,error,onConfirm,onEdit}:{plan:PlanPreviewData;confirming:boolean;error:string|null;onConfirm:()=>void;onEdit:()=>void}) {
  return <section className="glass-card p-6 rounded-3xl space-y-5"><h1 className="text-3xl text-white font-bold">Review your interview plan</h1>
    <AIInterviewer state={confirming?"transitioning":error || !plan.canConfirm && !plan.confirmedAt?"error/retry":"plan-ready"}/>
    <p>{plan.role} · Junior · {plan.mode} · {plan.setup.codeLanguage}</p>
    <p>{plan.effectiveCount} of {plan.requestedCount} requested questions · {plan.effectiveMinutes} of {plan.requestedMinutes} minutes</p>
    <p>Includes {plan.timeBudget.setupWrapMinutes} minutes setup/wrap-up and {plan.timeBudget.probeReserveMinutes} minutes probe reserve. Slack: {plan.timeBudget.slackMinutes} minutes.</p>
    <h2 className="font-bold">Competency coverage</h2><ul>{Object.entries(plan.coverage).map(([id,n])=><li key={id}>{ROOT_LABELS[id] || id}: {n} original questions</li>)}</ul>
    <h2 className="font-bold">Difficulty distribution</h2><p>Easy: {plan.difficultyDistribution.easy} · Standard: {plan.difficultyDistribution.standard} · Stretch: {plan.difficultyDistribution.stretch}</p>
    {plan.shortages.length>0 && <div role="alert" className="text-amber-200"><h2>Review these shortages and fallback choices</h2><ul>{plan.shortages.map((s,i)=><li key={s+i}>{shortageLabel(s)}</li>)}</ul></div>}
    <p>Company: {plan.setup.modifiers.company || "Core practice"}. Occurrence dates: {plan.setup.modifiers.occurredAfter || "No lower bound"} — {plan.setup.modifiers.occurredBefore || "No upper bound"}. Preferences are preserved in every fallback.</p>
    <p>Resume/JD unavailable. Design-lite: {plan.setup.modifiers.designLite?"allowed when feasible":"off"}.</p>
    <p>Recent interview trends: {plan.setup.includeRecentTrends?"included when eligible":"off; starter and human-approved practice bank"}.</p>
    <p>Questions come from the trusted starter bank and eligible approved practice. {plan.evaluationMode === "legacy" ? "This historical practice uses legacy evaluation." : "Trusted starters use the established interview evaluator. Dynamic questions use rubric evaluation and show their own scoring readiness."}</p>
    <ol className="space-y-2">{plan.items.map(item=><li key={item.id}>{item.position+1}. {ROOT_LABELS[item.competency.split('.')[0]]} · {item.category} · {item.difficulty} · {item.estimatedMinutes} min · {item.inventoryClass==="TRUSTED_BASELINE"?"Trusted starter":item.publicationClass==="fresh/provisional"?"Practice ready · provisional scoring":"Reviewed core question"} · {item.selectionReason.replaceAll('_',' ')}{!item.available?" · unavailable":""}</li>)}</ol>
    {error && <p role="alert" className="text-rose-300">{error}</p>}
    <div className="flex gap-4"><button className="btn-primary" disabled={confirming || !plan.canConfirm && !plan.confirmedAt} onClick={onConfirm}>{confirming?"Starting…":plan.confirmedAt?"Open confirmed practice":"Confirm and start"}</button>
      <button disabled={confirming} onClick={onEdit}>Change setup / preferences</button></div>
  </section>;
}
