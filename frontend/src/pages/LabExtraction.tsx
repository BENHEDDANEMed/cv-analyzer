// Laboratoire : tester le Module 1 (nettoyage, segmentation, NER) sur n'importe quel texte.
import { useState } from "react";
import { Icon } from "../components/Icon";
import { Alert, Button, Card, EmptyState, Field, PageHeader } from "../components/ui";
import { Highlighter } from "../components/Highlighter";
import { api } from "../lib/api";
import { SAMPLE_CV, SAMPLE_JOB } from "../lib/samples";
import type { ExtractResponse } from "../lib/types";

const SECTION_LABELS: Record<string, string> = {
  profil: "Profil", experience: "Expériences", formation: "Formation", competences: "Compétences", projets: "Projets", autre: "Autre",
};

export function LabExtractionPage() {
  const [text, setText] = useState(SAMPLE_CV);
  const [kind, setKind] = useState<"cv" | "offre">("cv");
  const [res, setRes] = useState<ExtractResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (text.trim().length < 10) {
      setError("Saisissez au moins 10 caractères.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setRes(await api.extract(text, kind));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const doc = res?.document;
  const skills = doc ? [...doc.hard_skills, ...doc.soft_skills] : [];

  return (
    <>
      <PageHeader title="Extraction NER" subtitle="Module 1 · Testez le nettoyage, la segmentation et la reconnaissance d'entités sur un texte libre." />
      <div className="grid grid-1-2" style={{ alignItems: "start" }}>
        <Card title="Texte à analyser"
          actions={
            <div className="segmented" role="group" aria-label="Type de document">
              <button type="button" aria-pressed={kind === "cv"} onClick={() => setKind("cv")}>CV</button>
              <button type="button" aria-pressed={kind === "offre"} onClick={() => setKind("offre")}>Offre</button>
            </div>
          }>
          <div className="stack">
            <Field label="Contenu" hint={`${text.length} caractères`}>
              {(p) => <textarea className="textarea" rows={18} value={text} onChange={(e) => setText(e.target.value)} {...p} />}
            </Field>
            <div className="row">
              <Button variant="ghost" size="sm" onClick={() => { setText(SAMPLE_CV); setKind("cv"); }}>Exemple CV</Button>
              <Button variant="ghost" size="sm" onClick={() => { setText(SAMPLE_JOB); setKind("offre"); }}>Exemple offre</Button>
              <Button variant="ghost" size="sm" onClick={() => setText("")}>Vider</Button>
            </div>
            {error && <Alert>{error}</Alert>}
            <Button icon="scan" block loading={loading} onClick={run}>{loading ? "Extraction…" : "Extraire les entités"}</Button>
          </div>
        </Card>

        {!doc ? (
          <div className="card"><EmptyState icon="scan" title="Aucun résultat pour l'instant"
            text="Lancez l'extraction : les compétences reconnues seront surlignées dans le texte et listées avec leur forme normalisée." /></div>
        ) : (
          <div className="stack">
            <div className="grid grid-4">
              {[
                ["Compétences techniques", doc.hard_skills.length],
                ["Soft skills", doc.soft_skills.length],
                ["Sections détectées", Object.keys(doc.sections).length],
                ["Durée", `${res!.duration_ms} ms`],
              ].map(([label, value]) => (
                <div key={label as string} className="card kpi" style={{ padding: 16 }}>
                  <span className="kpi-top">{label}</span>
                  <span className="kpi-value" style={{ fontSize: 24 }}>{value}</span>
                </div>
              ))}
            </div>
            <Card title="Texte nettoyé et entités" subtitle={`Moteur : ${res!.ner_engine}`}
              actions={<div className="legend">
                <span className="legend-item"><span className="dot" style={{ background: "var(--hard)" }} /> Technique</span>
                <span className="legend-item"><span className="dot" style={{ background: "var(--soft)" }} /> Soft skill</span>
              </div>}>
              <Highlighter text={doc.clean_text} skills={skills} />
            </Card>
            <Card flush title="Entités normalisées" subtitle="Forme trouvée dans le texte → nom canonique du dictionnaire">
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Nom normalisé</th><th>Type</th><th>Catégorie</th><th>Formes trouvées</th>{kind === "offre" && <th>Priorité</th>}</tr></thead>
                  <tbody>
                    {skills.map((s) => (
                      <tr key={s.name}>
                        <td className="strong">{s.name}</td>
                        <td><span className={`badge ${s.type === "hard_skill" ? "badge-hard" : "badge-soft"}`}>{s.type === "hard_skill" ? "Technique" : "Soft skill"}</span></td>
                        <td className="muted">{s.category ?? "—"}</td>
                        <td className="muted">{s.mentions.join(", ")}</td>
                        {kind === "offre" && <td>{s.optional ? "Souhaitée" : "Obligatoire"}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <div className="grid grid-2">
              <Card title="Sections (segmentation)">
                {kind === "offre" ? <p className="muted">Les offres ne sont pas segmentées : le texte entier est utilisé.</p> : (
                  <ul className="stack-sm" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {Object.entries(doc.sections).map(([k, v]) => (
                      <li key={k} className="row-between small">
                        <span className="row"><Icon name="file" size={16} />{SECTION_LABELS[k] ?? k}</span>
                        <span className="subtle num">{(v ?? "").length} car.</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card title="Diplômes et expérience">
                <dl className="kv">
                  <dt>Diplômes</dt><dd>{doc.degrees.map((d) => `${d.label} (niveau ${d.level})`).join(", ") || "—"}</dd>
                  <dt>{kind === "cv" ? "Expérience cumulée" : "Expérience exigée"}</dt><dd>{doc.years_experience ?? "—"} an(s)</dd>
                </dl>
              </Card>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
