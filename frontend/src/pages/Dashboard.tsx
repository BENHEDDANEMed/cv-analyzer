// Tableau de bord : indicateurs, évolution du score, compétences manquantes, analyses récentes.
import { useEffect, useState, type ReactNode } from "react";
import { Icon, type IconName } from "../components/Icon";
import { Alert, Card, EmptyState, PageHeader, ScorePill, Spinner } from "../components/ui";
import { ScoreLineChart, StatusBar } from "../components/charts";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Link } from "../lib/router";
import { formatDate } from "../lib/format";
import type { AnalysisSummary, DashboardStats, Health } from "../lib/types";

function Kpi({ icon, label, value, foot }: { icon: IconName; label: string; value: string; foot?: ReactNode }) {
  return (
    <div className="card kpi">
      <div className="kpi-top">
        <span>{label}</span>
        <span className="kpi-icon"><Icon name={icon} size={18} /></span>
      </div>
      <div className="kpi-value">{value}</div>
      {foot && <div className="kpi-foot">{foot}</div>}
    </div>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recent, setRecent] = useState<AnalysisSummary[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.stats(), api.listAnalyses()])
      .then(([s, list]) => {
        setStats(s);
        setRecent(list.slice(0, 5));
      })
      .catch((e) => setError(e.message));
    api.health().then(setHealth).catch(() => setHealth(null));
  }, []);

  const firstName = user?.full_name.split(" ")[0] ?? "";
  const header = (
    <PageHeader title={`Bonjour ${firstName}`} subtitle="Voici le résumé de vos analyses CV / offre d'emploi."
      actions={<Link to="/analyses/nouvelle" className="btn btn-primary"><Icon name="plus" size={18} /> Nouvelle analyse</Link>} />
  );

  if (error) return <>{header}<Alert>{error}</Alert></>;
  if (!stats) return <>{header}<Spinner /></>;

  if (stats.total_analyses === 0) {
    return (
      <>
        {header}
        <div className="card">
          <EmptyState icon="rocket" title="Lancez votre première analyse"
            text="Déposez un CV et collez une offre d'emploi : vous obtiendrez un score d'adéquation, la liste des compétences manquantes et des conseils."
            action={
              <div className="row" style={{ justifyContent: "center" }}>
                <Link to="/analyses/nouvelle" className="btn btn-primary"><Icon name="plus" size={18} /> Nouvelle analyse</Link>
                <Link to="/analyses/nouvelle?exemple=1" className="btn btn-secondary"><Icon name="sparkles" size={18} /> Essayer avec l'exemple</Link>
              </div>
            } />
        </div>
        <SystemCard health={health} />
      </>
    );
  }

  const delta = stats.last_delta;
  return (
    <>
      {header}
      <div className="grid grid-4">
        <Kpi icon="layers" label="Analyses réalisées" value={String(stats.total_analyses)} foot="Depuis la création du compte" />
        <Kpi icon="target" label="Score moyen" value={`${stats.average_score?.toFixed(0) ?? "—"}/100`} foot="Toutes analyses confondues" />
        <Kpi icon="award" label="Meilleur score" value={`${stats.best_score?.toFixed(0) ?? "—"}/100`} foot="Votre meilleure adéquation" />
        <Kpi icon="trendingUp" label="Dernier score" value={`${stats.last_score?.toFixed(0) ?? "—"}/100`}
          foot={delta === null ? "Première analyse" : (
            <span className={delta >= 0 ? "delta-up" : "delta-down"}>
              {delta >= 0 ? "+" : ""}{delta.toFixed(1)} point{Math.abs(delta) >= 2 ? "s" : ""} par rapport à la précédente
            </span>
          )} />
      </div>

      <div className="grid grid-2-1">
        <Card title="Évolution du score" subtitle="Vos 12 dernières analyses (survolez un point pour le détail)">
          <ScoreLineChart points={stats.score_history} />
        </Card>
        <Card title="Bilan des compétences" subtitle="Toutes les exigences des offres analysées">
          <div className="stack">
            <StatusBar counts={stats.status_totals} />
            <div className="stack-sm">
              <h3 style={{ fontSize: 14 }}>Compétences obligatoires les plus souvent absentes</h3>
              {stats.top_missing_skills.length === 0 ? (
                <p className="subtle">Aucune compétence obligatoire manquante. Bravo !</p>
              ) : (
                <ol className="stack-sm" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {stats.top_missing_skills.slice(0, 6).map((s) => (
                    <li key={s.name} className="meter-row">
                      <span className="small">{s.name}</span>
                      <span className="subtle num">{s.count} fois</span>
                      <div className="progress sm tone-low" aria-hidden="true">
                        <span style={{ width: `${(s.count / stats.top_missing_skills[0].count) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-2-1">
        <Card title="Analyses récentes" flush actions={<Link to="/historique" className="btn btn-ghost btn-sm">Tout voir <Icon name="arrowRight" size={16} /></Link>}>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Offre</th><th>Date</th><th>Score</th><th>Absentes</th></tr>
              </thead>
              <tbody>
                {recent.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <div className="cell-title">
                        <Link to={`/analyses/${a.id}`}>{a.title}</Link>
                        <span>{a.company ?? a.cv_filename ?? "—"}</span>
                      </div>
                    </td>
                    <td className="nowrap muted">{formatDate(a.created_at)}</td>
                    <td><ScorePill score={a.global_score} /></td>
                    <td className="num">{a.counts.absent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <SystemCard health={health} />
      </div>
    </>
  );
}

function SystemCard({ health }: { health: Health | null }) {
  const rows: [string, string, boolean][] = health
    ? [
        ["Moteur NER", health.ner_engine, true],
        ["Embeddings", health.embedding_backend, !health.embedding_backend.includes("secours")],
        ["LLM", health.llm_model ?? "non configuré (règles)", health.llm_configured],
      ]
    : [];
  return (
    <Card title="État du système" subtitle="Composants NLP utilisés par l'API">
      {!health ? (
        <Alert>API injoignable. Lancez le backend : <code>uvicorn backend.app.main:app</code></Alert>
      ) : (
        <ul className="stack-sm" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {rows.map(([label, value, ok]) => (
            <li key={label} className="row-between" style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
              <span className="row small"><Icon name={ok ? "checkCircle" : "alert"} size={16}
                style={{ color: ok ? "var(--success)" : "var(--warning)" }} />{label}</span>
              <code className="subtle">{value}</code>
            </li>
          ))}
          <li className="subtle" style={{ paddingTop: 4 }}>
            Testez chaque module dans le <Link to="/laboratoire/extraction">laboratoire NLP</Link>.
          </li>
        </ul>
      )}
    </Card>
  );
}
