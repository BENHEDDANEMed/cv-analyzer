// Laboratoire : simuler l'effet de la pondération sur une analyse existante (calcul instantané).
import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { Alert, Button, Card, EmptyState, PageHeader, Progress, Spinner } from "../components/ui";
import { ScoreGauge } from "../components/charts";
import { api } from "../lib/api";
import { Link, useRouter } from "../lib/router";
import { computeGlobal, DEFAULT_WEIGHTS, formatDate, normalizeWeights, scoreTone, WEIGHT_LABELS } from "../lib/format";
import type { AnalysisRecord, AnalysisSummary, Weights } from "../lib/types";

const PRESETS: { label: string; w: Weights }[] = [
  { label: "Cahier des charges", w: DEFAULT_WEIGHTS },
  { label: "Profil junior", w: { hard_skills: 0.6, experience: 0.05, formation: 0.25, soft_skills: 0.1 } },
  { label: "Profil expérimenté", w: { hard_skills: 0.35, experience: 0.45, formation: 0.1, soft_skills: 0.1 } },
  { label: "Équilibré", w: { hard_skills: 0.25, experience: 0.25, formation: 0.25, soft_skills: 0.25 } },
];

const KEYS = Object.keys(WEIGHT_LABELS) as (keyof Weights)[];

export function LabWeightsPage() {
  const { search, navigate } = useRouter();
  const [list, setList] = useState<AnalysisSummary[] | null>(null);
  const [record, setRecord] = useState<AnalysisRecord | null>(null);
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [error, setError] = useState<string | null>(null);
  const selectedId = Number(search.get("id")) || list?.[0]?.id;

  useEffect(() => {
    api.listAnalyses().then(setList).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setRecord(null);
    api.getAnalysis(selectedId)
      .then((rec) => { setRecord(rec); setWeights(rec.result.weights); })
      .catch((e) => setError(e.message));
  }, [selectedId]);

  const norm = normalizeWeights(weights);
  const simulated = useMemo(() => (record ? computeGlobal(record.result.sub_scores, norm) : 0), [record, norm]);

  const header = <PageHeader title="Simulateur de poids" subtitle="Changez la pondération et observez l'effet sur le score global, sans relancer l'analyse." />;
  if (error) return <>{header}<Alert>{error}</Alert></>;
  if (!list) return <>{header}<Spinner /></>;
  if (!list.length) {
    return <>{header}<div className="card"><EmptyState icon="sliders" title="Aucune analyse à simuler"
      text="Le simulateur utilise les sous-scores d'une analyse existante." action={<Link to="/analyses/nouvelle?exemple=1" className="btn btn-primary">Créer une analyse d'exemple</Link>} /></div></>;
  }

  const original = record?.result.global_score ?? 0;
  const delta = Math.round((simulated - original) * 10) / 10;

  return (
    <>
      {header}
      <Card>
        <div className="row-between">
          <div className="field" style={{ minWidth: 280, flex: 1 }}>
            <label className="label" htmlFor="analysis-select">Analyse de référence</label>
            <select id="analysis-select" className="select" value={selectedId}
              onChange={(e) => navigate(`/laboratoire/poids?id=${e.target.value}`, { replace: true })}>
              {list.map((a) => <option key={a.id} value={a.id}>{a.title} — {formatDate(a.created_at)} ({Math.round(a.global_score)}/100)</option>)}
            </select>
          </div>
          <div className="row">
            {PRESETS.map((p) => <Button key={p.label} variant="secondary" size="sm" onClick={() => setWeights(p.w)}>{p.label}</Button>)}
          </div>
        </div>
      </Card>

      {!record ? <Spinner /> : (
        <div className="grid grid-1-2" style={{ alignItems: "start" }}>
          <Card title="Score simulé">
            <div className="stack" style={{ alignItems: "center" }}>
              <ScoreGauge score={simulated} />
              <div className="row" style={{ justifyContent: "center" }}>
                <span className="subtle">Score enregistré : <strong className="num" style={{ color: "var(--text)" }}>{Math.round(original)}</strong></span>
                <span className={`badge ${delta > 0 ? "badge-couvert" : delta < 0 ? "badge-absent" : "badge-neutral"}`}>
                  {delta > 0 ? "+" : ""}{delta.toFixed(1)} pt
                </span>
              </div>
              <Link to={`/analyses/${record.id}`} className="btn btn-ghost btn-sm">Voir l'analyse <Icon name="arrowRight" size={16} /></Link>
            </div>
          </Card>
          <Card title="Pondération" subtitle="Les poids sont normalisés pour totaliser 100 %. Un critère non évalué voit son poids redistribué.">
            <div className="stack">
              {KEYS.map((k) => {
                const sub = record.result.sub_scores[k];
                const contribution = sub === null ? null : (sub * norm[k]);
                return (
                  <div key={k} className="stack-sm" style={{ paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
                    <div className="row-between">
                      <label className="label" htmlFor={`sim-${k}`}>{WEIGHT_LABELS[k]}</label>
                      <span className="small num">
                        poids <strong>{Math.round(norm[k] * 100)} %</strong> · sous-score {sub === null ? "non évalué" : `${Math.round(sub)}/100`}
                        {contribution !== null && <> · apport <strong>{contribution.toFixed(1)}</strong></>}
                      </span>
                    </div>
                    <input id={`sim-${k}`} type="range" min={0} max={100} step={5} value={Math.round(weights[k] * 100)}
                      onChange={(e) => setWeights((w) => ({ ...w, [k]: Number(e.target.value) / 100 }))} />
                    <Progress value={sub ?? 0} small tone={sub === null ? undefined : scoreTone(sub)} label={`Sous-score ${WEIGHT_LABELS[k]}`} />
                  </div>
                );
              })}
              <p className="subtle">
                Formule : Score = Σ (poids × sous-score) / Σ poids des critères évalués.
                Utile pour justifier le choix des poids dans le rapport (par exemple : un poste junior valorise davantage la formation que l'expérience).
              </p>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
