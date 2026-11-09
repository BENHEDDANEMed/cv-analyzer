// Historique des analyses : recherche, tri, suppression.
import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { Alert, Card, ConfirmDialog, EmptyState, IconButton, PageHeader, ScorePill, Spinner } from "../components/ui";
import { useToast } from "../components/toast";
import { api } from "../lib/api";
import { Link } from "../lib/router";
import { formatDate } from "../lib/format";
import type { AnalysisSummary } from "../lib/types";

type Sort = "recent" | "ancien" | "score-desc" | "score-asc";

export function HistoryPage() {
  const toast = useToast();
  const [items, setItems] = useState<AnalysisSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [toDelete, setToDelete] = useState<AnalysisSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api.listAnalyses().then(setItems).catch((e) => setError(e.message));
  }, []);

  const rows = useMemo(() => {
    if (!items) return [];
    const q = query.trim().toLowerCase();
    const filtered = items.filter((a) => !q || [a.title, a.company, a.cv_filename].some((v) => v?.toLowerCase().includes(q)));
    const by: Record<Sort, (a: AnalysisSummary, b: AnalysisSummary) => number> = {
      recent: (a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id,
      ancien: (a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id,
      "score-desc": (a, b) => b.global_score - a.global_score,
      "score-asc": (a, b) => a.global_score - b.global_score,
    };
    return [...filtered].sort(by[sort]);
  }, [items, query, sort]);

  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.deleteAnalysis(toDelete.id);
      setItems((list) => list?.filter((a) => a.id !== toDelete.id) ?? null);
      toast("Analyse supprimée.");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setDeleting(false);
      setToDelete(null);
    }
  };

  return (
    <>
      <PageHeader title="Historique" subtitle="Toutes vos analyses, avec leur score et leurs écarts."
        actions={<Link to="/analyses/nouvelle" className="btn btn-primary"><Icon name="plus" size={18} /> Nouvelle analyse</Link>} />
      {error && <Alert>{error}</Alert>}
      {!items && !error && <Spinner />}
      {items && items.length === 0 && (
        <div className="card"><EmptyState icon="history" title="Aucune analyse pour l'instant" text="Vos analyses apparaîtront ici après leur lancement."
          action={<Link to="/analyses/nouvelle?exemple=1" className="btn btn-primary">Essayer avec l'exemple</Link>} /></div>
      )}
      {items && items.length > 0 && (
        <Card flush title={`${items.length} analyse${items.length > 1 ? "s" : ""}`}
          actions={
            <div className="row">
              <div className="input-wrap" style={{ width: 260 }}>
                <Icon name="search" size={16} className="input-icon" />
                <input className="input with-icon" placeholder="Poste, entreprise, fichier…" aria-label="Rechercher dans l'historique"
                  value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <label className="sr-only" htmlFor="sort">Trier</label>
              <select id="sort" className="select" style={{ width: 190 }} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="recent">Plus récentes</option>
                <option value="ancien">Plus anciennes</option>
                <option value="score-desc">Meilleur score</option>
                <option value="score-asc">Score le plus bas</option>
              </select>
            </div>
          }>
          {rows.length === 0 ? (
            <EmptyState icon="search" title="Aucun résultat" text={`Aucune analyse ne correspond à « ${query} ».`} />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Offre</th><th>Date</th><th>Score</th><th>Couvertes / Partielles / Absentes</th><th>Conseils</th><th><span className="sr-only">Actions</span></th></tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <div className="cell-title">
                          <Link to={`/analyses/${a.id}`}>{a.title}</Link>
                          <span>{[a.company, a.cv_filename].filter(Boolean).join(" · ") || "—"}</span>
                        </div>
                      </td>
                      <td className="nowrap muted">{formatDate(a.created_at, true)}</td>
                      <td><ScorePill score={a.global_score} /></td>
                      <td>
                        <div className="row" style={{ gap: 6 }}>
                          <span className="badge badge-couvert" title="Couvertes">{a.counts.couvert}</span>
                          <span className="badge badge-partiel" title="Partielles">{a.counts.partiel}</span>
                          <span className="badge badge-absent" title="Absentes">{a.counts.absent}</span>
                        </div>
                      </td>
                      <td>{a.has_recommendations ? <span className="badge badge-primary"><Icon name="check" size={14} /> Générés</span> : <span className="subtle">—</span>}</td>
                      <td style={{ textAlign: "right" }}>
                        <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                          <Link to={`/analyses/${a.id}`} className="btn btn-ghost btn-sm">Voir</Link>
                          <IconButton icon="trash" label={`Supprimer l'analyse « ${a.title} »`} onClick={() => setToDelete(a)} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
      <ConfirmDialog open={!!toDelete} title="Supprimer cette analyse ?" text={`« ${toDelete?.title ?? ""} » sera définitivement supprimée.`}
        confirmLabel="Supprimer" loading={deleting} onConfirm={remove} onCancel={() => setToDelete(null)} />
    </>
  );
}
