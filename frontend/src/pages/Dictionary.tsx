// Dictionnaire technologique utilisé pour la normalisation et les relations « implique ».
import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { Alert, EmptyState, PageHeader, Spinner } from "../components/ui";
import { api } from "../lib/api";
import type { DictionaryEntry } from "../lib/types";

export function DictionaryPage() {
  const [entries, setEntries] = useState<DictionaryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Toutes");

  useEffect(() => {
    api.skills().then(setEntries).catch((e) => setError(e.message));
  }, []);

  const categories = useMemo(() => ["Toutes", ...new Set((entries ?? []).map((e) => e.category ?? "Autre"))], [entries]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (entries ?? []).filter((e) =>
      (category === "Toutes" || e.category === category) &&
      (!q || e.name.toLowerCase().includes(q) || e.aliases.some((a) => a.toLowerCase().includes(q))));
  }, [entries, query, category]);

  return (
    <>
      <PageHeader title="Dictionnaire des compétences"
        subtitle={entries ? `${entries.length} compétences normalisées · variantes reconnues et relations « implique » utilisées par le moteur.` : "Chargement…"} />
      {error && <Alert>{error}</Alert>}
      {!entries && !error && <Spinner />}
      {entries && (
        <>
          <div className="row">
            <div className="input-wrap" style={{ width: 300 }}>
              <Icon name="search" size={16} className="input-icon" />
              <input className="input with-icon" placeholder="Rechercher une compétence ou une variante…" aria-label="Rechercher dans le dictionnaire"
                value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <label className="sr-only" htmlFor="cat">Catégorie</label>
            <select id="cat" className="select" style={{ width: 220 }} value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((c) => <option key={c}>{c}</option>)}
            </select>
            <span className="subtle">{rows.length} résultat{rows.length > 1 ? "s" : ""}</span>
          </div>
          {rows.length === 0 ? (
            <div className="card"><EmptyState icon="book" title="Aucune compétence trouvée" text="Essayez un autre terme ou une autre catégorie." /></div>
          ) : (
            <div className="dict-grid">
              {rows.map((e) => (
                <article key={e.name} className="card dict-card">
                  <div className="row-between">
                    <h3>{e.name}</h3>
                    <span className={`badge ${e.type === "hard_skill" ? "badge-hard" : "badge-soft"}`}>{e.category}</span>
                  </div>
                  {e.aliases.length > 0 && (
                    <div>
                      <span className="tag-label">Variantes reconnues</span>
                      <div className="chips">{e.aliases.slice(0, 8).map((a) => <span key={a} className="chip">{a}</span>)}</div>
                    </div>
                  )}
                  {e.implies.length > 0 && (
                    <div>
                      <span className="tag-label">Implique</span>
                      <div className="row small" style={{ gap: 6 }}>
                        <Icon name="arrowRight" size={14} style={{ color: "var(--text-subtle)" }} />
                        {e.implies.map((i) => <span key={i} className="chip chip-hard">{i}</span>)}
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
