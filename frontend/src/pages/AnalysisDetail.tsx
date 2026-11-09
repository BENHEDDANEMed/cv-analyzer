// Résultat d'une analyse : score, sous-scores, matrice des écarts, recommandations, entités.
import { useEffect, useMemo, useState } from "react";
import { Icon, type IconName } from "../components/Icon";
import { Alert, Button, Card, ConfirmDialog, EmptyState, PageHeader, Progress, Spinner, StatusBadge, Tabs } from "../components/ui";
import { ScoreGauge } from "../components/charts";
import { Highlighter } from "../components/Highlighter";
import { useToast } from "../components/toast";
import { api, downloadFile } from "../lib/api";
import { Link, useRouter } from "../lib/router";
import { formatDate, scoreTone, STATUS_ORDER, WEIGHT_LABELS } from "../lib/format";
import type { AnalysisRecord, MatchStatus, ParsedDocument, Recommendations, Weights } from "../lib/types";

type TabId = "ecarts" | "conseils" | "entites" | "texte";

export function AnalysisDetailPage({ id }: { id: number }) {
  const { navigate } = useRouter();
  const toast = useToast();
  const [record, setRecord] = useState<AnalysisRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("ecarts");
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api.getAnalysis(id).then(setRecord).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <><PageHeader title="Analyse" /><Alert>{error}</Alert><Link to="/historique">Retour à l'historique</Link></>;
  if (!record) return <Spinner label="Chargement de l'analyse" />;

  const r = record.result;
  const downloadReport = async () => {
    try {
      downloadFile(await api.report(id), `bilan_${id}.html`, "text/html");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  const remove = async () => {
    setDeleting(true);
    try {
      await api.deleteAnalysis(id);
      toast("Analyse supprimée.");
      navigate("/historique", { replace: true });
    } catch (e) {
      toast((e as Error).message, "error");
      setDeleting(false);
      setConfirm(false);
    }
  };

  return (
    <>
      <PageHeader
        breadcrumb={<><Link to="/historique">Historique</Link><Icon name="chevronRight" size={14} /><span>Analyse n° {id}</span></>}
        title={record.title}
        subtitle={[record.company, record.cv_filename && `CV : ${record.cv_filename}`, formatDate(record.created_at, true)].filter(Boolean).join(" · ")}
        actions={
          <>
            <Button variant="secondary" icon="download" onClick={downloadReport}>Bilan HTML</Button>
            <Button variant="secondary" icon="code" onClick={() => downloadFile(JSON.stringify(record, null, 2), `analyse_${id}.json`, "application/json")}>JSON</Button>
            <Link to={`/laboratoire/poids?id=${id}`} className="btn btn-secondary"><Icon name="sliders" size={18} /> Simuler les poids</Link>
            <Button variant="ghost" icon="trash" onClick={() => setConfirm(true)} aria-label="Supprimer l'analyse">Supprimer</Button>
          </>
        } />

      <div className="grid grid-3">
        <Card title="Score global">
          <ScoreGauge score={r.global_score} caption={`Calculé en ${(r.timings_ms.total / 1000).toFixed(2)} s · ${r.embedding_backend}`} />
        </Card>
        <Card title="Détail du score" subtitle="Sous-score × poids (formule du cahier des charges)">
          <div className="stack">
            {(Object.keys(WEIGHT_LABELS) as (keyof Weights)[]).map((k) => {
              const v = r.sub_scores[k];
              return (
                <div key={k} className="meter-row">
                  <span className="small strong">{WEIGHT_LABELS[k]} <span className="subtle">· {Math.round(r.weights[k] * 100)} %</span></span>
                  <span className="small num">{v === null ? <span className="subtle">non évalué</span> : `${Math.round(v)}/100`}</span>
                  <Progress value={v ?? 0} tone={v === null ? undefined : scoreTone(v)} label={`${WEIGHT_LABELS[k]} : ${v ?? 0} sur 100`} small />
                </div>
              );
            })}
          </div>
        </Card>
        <Card title="Bilan des exigences">
          <div className="stack">
            <div className="grid" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8 }}>
              <div className="status-tile tile-couvert" style={{ flexDirection: "column", alignItems: "flex-start" }}><strong>{record.counts.couvert}</strong><span>Couvertes</span></div>
              <div className="status-tile tile-partiel" style={{ flexDirection: "column", alignItems: "flex-start" }}><strong>{record.counts.partiel}</strong><span>Partielles</span></div>
              <div className="status-tile tile-absent" style={{ flexDirection: "column", alignItems: "flex-start" }}><strong>{record.counts.absent}</strong><span>Absentes</span></div>
            </div>
            <dl className="kv">
              <dt>Expérience</dt>
              <dd>{r.cv.years_experience ?? 0} an(s) détecté(s) · exigé : {r.job.years_experience ?? "non précisé"}</dd>
              <dt>Diplôme CV</dt>
              <dd>{r.cv.degrees.length ? r.cv.degrees.reduce((a, b) => (b.level > a.level ? b : a)).label : "non détecté"}</dd>
              <dt>Diplôme exigé</dt>
              <dd>{r.job.degrees.length ? r.job.degrees.reduce((a, b) => (b.level < a.level ? b : a)).label : "non précisé"}</dd>
            </dl>
            {r.not_evaluated.map((n) => <span key={n} className="subtle row"><Icon name="info" size={14} />{n}</span>)}
          </div>
        </Card>
      </div>

      <div className="card">
        <div style={{ padding: "0 var(--space-5)" }}>
          <Tabs<TabId> label="Sections du résultat" value={tab} onChange={setTab} tabs={[
            { id: "ecarts", label: "Matrice des écarts", count: r.gap_analysis.length, icon: "layers" },
            { id: "conseils", label: "Recommandations", icon: "sparkles" },
            { id: "entites", label: "Entités extraites", icon: "scan" },
            { id: "texte", label: "Texte du CV", icon: "file" },
          ]} />
        </div>
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="card-body">
          {tab === "ecarts" && <GapMatrix record={record} />}
          {tab === "conseils" && <RecommendationsPanel record={record} onChange={(reco) => setRecord({ ...record, recommendations: reco, has_recommendations: true })} />}
          {tab === "entites" && <div className="grid grid-2"><Entities title="CV" doc={r.cv} /><Entities title="Offre d'emploi" doc={r.job} /></div>}
          {tab === "texte" && (
            <div className="stack">
              <div className="legend">
                <span className="legend-item"><span className="dot" style={{ background: "var(--hard)" }} /> Compétence technique</span>
                <span className="legend-item"><span className="dot" style={{ background: "var(--soft)" }} /> Soft skill</span>
              </div>
              <Highlighter text={r.cv.clean_text} skills={[...r.cv.hard_skills, ...r.cv.soft_skills]} />
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog open={confirm} title="Supprimer cette analyse ?" text="Le résultat et les recommandations seront définitivement supprimés."
        confirmLabel="Supprimer" loading={deleting} onConfirm={remove} onCancel={() => setConfirm(false)} />
    </>
  );
}

// ------------------------------------------------------------------ Matrice des écarts
function GapMatrix({ record }: { record: AnalysisRecord }) {
  const [status, setStatus] = useState<MatchStatus | "Tous">("Tous");
  const [type, setType] = useState<"tous" | "hard_skill" | "soft_skill">("tous");
  const [query, setQuery] = useState("");
  const all = record.result.gap_analysis;

  const rows = useMemo(() => all
    .filter((m) => status === "Tous" || m.status === status)
    .filter((m) => type === "tous" || m.type === type)
    .filter((m) => m.required.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => Number(a.optional) - Number(b.optional) || STATUS_ORDER[a.status] - STATUS_ORDER[b.status]),
  [all, status, type, query]);

  const filters: (MatchStatus | "Tous")[] = ["Tous", "Absent", "Partiel", "Couvert"];
  return (
    <div className="stack">
      <div className="row-between">
        <div className="chips" role="group" aria-label="Filtrer par état">
          {filters.map((f) => (
            <button key={f} className="chip chip-filter" aria-pressed={status === f} onClick={() => setStatus(f)}>
              {f} <span className="subtle num">{f === "Tous" ? all.length : all.filter((m) => m.status === f).length}</span>
            </button>
          ))}
        </div>
        <div className="row">
          <label className="sr-only" htmlFor="gap-type">Type de compétence</label>
          <select id="gap-type" className="select" style={{ width: 190 }} value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="tous">Tous les types</option>
            <option value="hard_skill">Compétences techniques</option>
            <option value="soft_skill">Soft skills</option>
          </select>
          <div className="input-wrap" style={{ width: 220 }}>
            <Icon name="search" size={16} className="input-icon" />
            <input className="input with-icon" placeholder="Rechercher…" aria-label="Rechercher une compétence" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon="search" title="Aucun résultat" text="Aucune compétence ne correspond à ces filtres." />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Compétences exigées par l'offre et leur état dans le CV</caption>
            <thead>
              <tr><th>Compétence exigée</th><th>Priorité</th><th>État</th><th>Similarité</th><th>Élément du CV</th><th>Justification</th></tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.required}>
                  <td>
                    <div className="cell-title">
                      <span className="strong" style={{ color: "var(--text)", fontSize: 14 }}>{m.required}</span>
                      <span>{m.type === "hard_skill" ? "Technique" : "Soft skill"}</span>
                    </div>
                  </td>
                  <td>{m.optional ? <span className="badge badge-neutral">Souhaitée</span> : <span className="badge badge-primary">Obligatoire</span>}</td>
                  <td><StatusBadge status={m.status} /></td>
                  <td style={{ minWidth: 120 }}>
                    <div className="stack-sm" style={{ gap: 4 }}>
                      <span className="num small">{m.similarity.toFixed(2)}</span>
                      <Progress value={m.similarity * 100} small label={`Similarité ${m.similarity.toFixed(2)}`}
                        tone={m.status === "Couvert" ? "good" : m.status === "Partiel" ? "mid" : "low"} />
                    </div>
                  </td>
                  <td className="muted">{m.matched_with ?? "—"}</td>
                  <td className="muted">{m.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Recommandations
const ACTION_ICON: Record<string, IconName> = { projet: "rocket", certification: "award", formation: "graduation", ressource: "book" };

function RecommendationsPanel({ record, onChange }: { record: AnalysisRecord; onChange: (r: Recommendations) => void }) {
  const toast = useToast();
  const [useLlm, setUseLlm] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reco = record.recommendations;

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.recommend(record.id, useLlm);
      onChange(res);
      toast(res.source === "llm" ? "Recommandations générées par le LLM." : "Recommandations générées par règles (LLM indisponible).", res.source === "llm" ? "success" : "info");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const controls = (
    <div className="row">
      <label className="row small" style={{ cursor: "pointer" }}>
        <input type="checkbox" checked={useLlm} onChange={(e) => setUseLlm(e.target.checked)} /> Utiliser le LLM
      </label>
      <Button icon={reco ? "refresh" : "sparkles"} variant={reco ? "secondary" : "primary"} loading={loading} onClick={generate}>
        {loading ? "Rédaction en cours…" : reco ? "Régénérer" : "Générer les recommandations"}
      </Button>
    </div>
  );

  if (!reco) {
    return (
      <div className="stack">
        {error && <Alert>{error}</Alert>}
        <EmptyState icon="sparkles" title="Pas encore de recommandations"
          text="Le module « Guider » rédige une synthèse, des reformulations de votre CV et une feuille de route. Avec un LLM local, cela peut prendre jusqu'à une minute."
          action={controls} />
      </div>
    );
  }

  return (
    <div className="stack">
      {error && <Alert>{error}</Alert>}
      <div className="row-between">
        <span className={`badge ${reco.source === "llm" ? "badge-primary" : "badge-neutral"}`}>
          <Icon name={reco.source === "llm" ? "sparkles" : "cpu"} size={14} />
          {reco.source === "llm" ? "Généré par le modèle de langage" : "Généré par règles (LLM indisponible)"}
        </span>
        {controls}
      </div>
      <div className="callout">
        <div className="callout-title"><Icon name="info" size={18} /> Synthèse</div>
        {reco.synthese}
      </div>
      <div className="grid grid-2">
        <Card title="Forces">
          <ul className="list">{reco.forces.map((f) => <li key={f}>{f}</li>)}</ul>
        </Card>
        <Card title="Lacunes prioritaires">
          {reco.lacunes_prioritaires.length ? <ul className="list">{reco.lacunes_prioritaires.map((f) => <li key={f}>{f}</li>)}</ul> : <p className="muted">Aucune lacune prioritaire.</p>}
        </Card>
      </div>
      <Card title="Reformulations proposées" subtitle="Aligner le vocabulaire du CV sur les mots-clés de l'offre">
        {reco.reformulations.length === 0 ? <p className="muted">Aucune reformulation proposée.</p> : (
          <div className="stack">
            {reco.reformulations.map((f, i) => (
              <div key={i} className="compare-pair">
                <div className="before"><span className="tag-label">Avant</span>{f.avant}</div>
                <div className="arrow"><Icon name="arrowRight" /></div>
                <div className="after"><span className="tag-label">Après</span>{f.apres}
                  {f.mots_cles.length > 0 && <div className="chips" style={{ marginTop: 8 }}>{f.mots_cles.map((k) => <span key={k} className="chip chip-hard">{k}</span>)}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card title="Feuille de route d'apprentissage" subtitle="Actions concrètes pour combler les écarts, par ordre de priorité">
        {reco.plan_action.length === 0 ? <p className="muted">Rien à prévoir : toutes les exigences sont couvertes.</p> : (
          <div>
            {reco.plan_action.map((a, i) => (
              <div key={i} className="action-item">
                <span className="action-icon"><Icon name={ACTION_ICON[a.type] ?? "book"} /></span>
                <div className="stack-sm" style={{ gap: 4, flex: 1 }}>
                  <div className="row"><strong>{a.competence}</strong><span className="badge badge-neutral">{a.type}</span>
                    {a.duree_estimee && <span className="subtle row" style={{ gap: 4 }}><Icon name="history" size={14} />{a.duree_estimee}</span>}</div>
                  <p className="muted small">{a.action}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ Entités extraites
function Entities({ title, doc }: { title: string; doc: ParsedDocument }) {
  return (
    <Card title={title} subtitle={`${doc.hard_skills.length} compétences techniques · ${doc.soft_skills.length} soft skills`}>
      <div className="stack">
        <div className="stack-sm">
          <h3 style={{ fontSize: 14 }}>Compétences techniques</h3>
          <div className="chips">
            {doc.hard_skills.length ? doc.hard_skills.map((s) => (
              <span key={s.name} className="chip chip-hard" title={s.mentions.join(", ")}>{s.name}{s.optional && " · souhaitée"}</span>
            )) : <span className="subtle">Aucune</span>}
          </div>
        </div>
        <div className="stack-sm">
          <h3 style={{ fontSize: 14 }}>Soft skills</h3>
          <div className="chips">
            {doc.soft_skills.length ? doc.soft_skills.map((s) => <span key={s.name} className="chip chip-soft">{s.name}</span>) : <span className="subtle">Aucune</span>}
          </div>
        </div>
        <dl className="kv">
          <dt>Diplômes</dt><dd>{doc.degrees.map((d) => d.label).join(", ") || "—"}</dd>
          <dt>{doc.kind === "cv" ? "Expérience" : "Expérience exigée"}</dt><dd>{doc.years_experience ?? "—"} an(s)</dd>
          {doc.kind === "cv" && <><dt>Sections</dt><dd>{Object.keys(doc.sections).join(", ")}</dd></>}
        </dl>
      </div>
    </Card>
  );
}
