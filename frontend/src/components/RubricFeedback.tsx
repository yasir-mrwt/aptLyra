import type {RubricEvaluation} from "../types/session";
export default function RubricFeedback({evaluation:e}:{evaluation:RubricEvaluation}){
  return <section aria-label="Rubric evaluation" className="glass-card p-6 rounded-2xl mt-6 space-y-3">
    <h2>{e.status === "abstained"?"Abstained":e.rubricStatus === "reviewed"?"Reviewed":"Provisional"}</h2>
    <p>Evaluator Confidence: {e.evaluatorConfidence[0].toUpperCase()+e.evaluatorConfidence.slice(1)}</p>
    {e.technicalScore === null ? <p>Score withheld · {e.reasons.join(", ").replaceAll("_"," ")}</p> : <p>{e.rubricStatus === "provisional"?"Provisional practice estimate":"Technical score"}: {e.technicalScore}/100</p>}
    <p>{e.feedback}</p>
    <dl>{Object.entries(e.dimensions).map(([name,value])=><div key={name}><dt>{name.replaceAll("-"," ")}</dt><dd>{value?.toFixed(1)}/4</dd></div>)}</dl>
    {e.concepts.length>0 && <div><h3>Concept coverage</h3><ul>{e.concepts.map(c=><li key={c.id}>{c.label}: {c.judgment} · {c.explanation}</li>)}</ul></div>}
    <p>Communication (descriptive only): {e.communication}</p>
    <p>Objective evidence: {e.objective.summary}</p>
    {e.rubricStatus!=="reviewed" && <p>This result is excluded from the reviewed aggregate.</p>}
  </section>;
}
