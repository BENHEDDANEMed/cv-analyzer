// Laboratoire : tester le Module 2 sur deux listes de compétences (synonymie, embeddings, seuils).
import { useState, type KeyboardEvent } from "react";
import { Icon } from "../components/Icon";
import { Alert, Button, Card, EmptyState, PageHeader, StatusBadge } from "../components/ui";
import { api } from "../lib/api";
import { COMPARE_PRESETS } from "../lib/samples";
import type { CompareResponse } from "../lib/types";

function ChipInput({ id, label, values, onChange, placeholder }: {
  id: string; label: string; values: string[]; onChange: (v: string[]) => void; placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const items = raw.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
    if (items.length) onChange([...values, ...items.filter((i) => !values.includes(i))].slice(0, 30));
    setDraft("");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(draft); }
    if (e.key === "Backspace" && !draft && values.length) onChange(values.slice(0, -1));
  };
  return (
    <div className="field">
      <label className="label" htmlFor={id}>{label}</label>
      <div className="chips" style={{ minHeight: 32 }}>
        {values.map((v) => (
          <span key={v} className="chip">{v}
            <button type="button" aria-label={`Retirer ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}><Icon name="x" size={12} /></button>
          </span>
        ))}
        {!values.length && <span className="subtle">Aucune compétence</span>}
      </div>
      <input id={id} className="input" value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey} onBlur={() => draft && add(draft)} onPaste={(e) => { e.preventDefault(); add(e.clipboardData.getData("text")); }} />
      <span className="hint">Entrée ou virgule pour ajouter · vous pouvez coller une liste.</span>
    </div>
  );
}

function cellStyle(v: number, t: { couvert: number; partiel: number }) {
  if (v >= t.couvert) return { background: "var(--success-soft)", color: "var(--success)" };
  if (v >= t.partiel) return { background: "var(--warning-soft)", color: "var(--warning)" };
  return { background: "var(--surface-2)", color: "var(--text-muted)" };
}

export function LabComparePage() {
  const [required, setRequired] = useState<string[]>(COMPARE_PRESETS[0].required);
  const [candidate, setCandidate] = useState<string[]>(COMPARE_PRESETS[0].candidate);
  const [res, setRes] = useState<CompareResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (!required.length || !candidate.length) {
      setError("Ajoutez au moins une compétence de chaque côté.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setRes(await api.compare(required, candidate));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeader title="Comparateur de compétences" subtitle="Module 2 · Observez comment le système relie les compétences d'une offre à celles d'un CV." />
      <Card title="Scénarios de test" subtitle="Cas tirés de la problématique du cahier des charges">
        <div className="row">
          {COMPARE_PRESETS.map((p) => (
            <Button key={p.label} variant="secondary" size="sm" onClick={() => { setRequired(p.required); setCandidate(p.candidate); setRes(null); }}>{p.label}</Button>
          ))}
        </div>
      </Card>
      <div className="grid grid-2">
        <Card title="Exigées par l'offre">
          <ChipInput id="req" label="Compétences de l'offre" values={required} onChange={setRequired} placeholder="Ex. Deep Learning" />
        </Card>
        <Card title="Présentes dans le CV">
          <ChipInput id="cand" label="Compétences du candidat" values={candidate} onChange={setCandidate} placeholder="Ex. pytorch" />
        </Card>
      </div>
      {error && <Alert>{error}</Alert>}
      <div><Button icon="compare" loading={loading} onClick={run}>{loading ? "Comparaison…" : "Comparer"}</Button></div>

      {!res ? (
        <div className="card"><EmptyState icon="compare" title="Lancez une comparaison"
          text="Les termes sont d'abord normalisés avec le dictionnaire (ex. « pytorch » → PyTorch), puis comparés par règles et par similarité cosinus." /></div>
      ) : (
        <div className="grid grid-2" style={{ alignItems: "start" }}>
          <Card flush title="Résultat de l'appariement" subtitle="Règles du dictionnaire d'abord, embeddings ensuite">
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Exigée</th><th>État</th><th>Justification</th></tr></thead>
                <tbody>
                  {res.matches.map((m) => (
                    <tr key={m.required}>
                      <td className="strong">{m.required}</td>
                      <td><StatusBadge status={m.status} /></td>
                      <td className="muted">{m.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title="Matrice de similarité cosinus" subtitle={`Embeddings : ${res.embedding_backend}`}>
            <div className="stack">
              <div className="table-wrap">
                <table className="heatmap">
                  <caption className="sr-only">Similarité entre chaque compétence de l'offre (lignes) et du CV (colonnes)</caption>
                  <thead>
                    <tr><th scope="col"><span className="sr-only">Offre / CV</span></th>{res.candidate.map((c) => <th key={c} scope="col">{c}</th>)}</tr>
                  </thead>
                  <tbody>
                    {res.required.map((r, i) => (
                      <tr key={r}>
                        <th scope="row">{r}</th>
                        {res.matrix[i].map((v, j) => <td key={j} style={cellStyle(v, res.thresholds)}>{v.toFixed(2)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="legend">
                <span className="legend-item"><span className="dot" style={{ background: "var(--success)" }} /> ≥ {res.thresholds.couvert} : Couvert</span>
                <span className="legend-item"><span className="dot" style={{ background: "var(--warning)" }} /> ≥ {res.thresholds.partiel} : Partiel</span>
                <span className="legend-item"><span className="dot" style={{ background: "var(--border-strong)" }} /> en dessous : Absent</span>
              </div>
              <Alert tone="info">La matrice montre la similarité « brute » des noms. Le statut final peut être plus élevé grâce aux règles du dictionnaire (ex. PyTorch implique Deep Learning).</Alert>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
