// Structure de l'application connectée : barre latérale + barre supérieure + contenu.
import { useEffect, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { IconButton } from "./ui";
import { Link, useRouter } from "../lib/router";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { initials, ROLE_LABELS } from "../lib/format";
import { storage } from "../lib/storage";
import type { Health } from "../lib/types";

const NAV: { label: string; items: { to: string; label: string; icon: IconName }[] }[] = [
  {
    label: "Analyse",
    items: [
      { to: "/", label: "Tableau de bord", icon: "dashboard" },
      { to: "/analyses/nouvelle", label: "Nouvelle analyse", icon: "plus" },
      { to: "/historique", label: "Historique", icon: "history" },
    ],
  },
  {
    label: "Laboratoire NLP",
    items: [
      { to: "/laboratoire/extraction", label: "Extraction NER", icon: "scan" },
      { to: "/laboratoire/comparateur", label: "Comparateur", icon: "compare" },
      { to: "/laboratoire/poids", label: "Simulateur de poids", icon: "sliders" },
    ],
  },
  {
    label: "Ressources",
    items: [{ to: "/dictionnaire", label: "Dictionnaire", icon: "book" }],
  },
];

function isActive(to: string, path: string) {
  if (to === "/") return path === "/";
  if (to === "/historique") return path === "/historique" || (/^\/analyses\/\d+/.test(path));
  return path === to;
}

export function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || "light");
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    storage.set("theme", next);
    setTheme(next);
  };
  return { theme, toggle };
}

export function Layout({ children }: { children: ReactNode }) {
  const { path } = useRouter();
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const [health, setHealth] = useState<Health | null | "ko">(null);

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth("ko"));
  }, []);

  return (
    <div className="app">
      <a href="#contenu" className="skip-link">Aller au contenu</a>
      <div className={`sidebar-backdrop ${open ? "open" : ""}`} onClick={() => setOpen(false)} />
      <aside className={`sidebar ${open ? "open" : ""}`} aria-label="Navigation principale">
        <Link to="/" className="brand">
          <span className="brand-mark"><Icon name="target" size={20} /></span>
          <span>
            <span className="brand-name">CV Match</span>
            <span className="brand-sub" style={{ display: "block" }}>Analyseur intelligent</span>
          </span>
        </Link>
        <nav>
          {NAV.map((group) => (
            <div className="nav-group" key={group.label}>
              <span className="nav-label">{group.label}</span>
              {group.items.map((item) => (
                <Link key={item.to} to={item.to} className="nav-link" aria-current={isActive(item.to, path) ? "page" : undefined}>
                  <Icon name={item.icon} size={18} />
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          {user && (
            <Link to="/profil" className="user-chip" aria-current={path === "/profil" ? "page" : undefined}>
              <span className="avatar">{initials(user.full_name)}</span>
              <span className="user-meta">
                <strong>{user.full_name}</strong>
                <span>{ROLE_LABELS[user.role]}</span>
              </span>
            </Link>
          )}
          <button className="nav-link" style={{ border: 0, background: "none", cursor: "pointer", font: "inherit" }} onClick={logout}>
            <Icon name="logout" size={18} /> Se déconnecter
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <IconButton icon="menu" label="Ouvrir le menu" className="menu-btn" onClick={() => setOpen(true)} />
          <div className="topbar-spacer" />
          <span className="api-chip" title={health && health !== "ko" ? `NER : ${health.ner_engine} · LLM : ${health.llm_model ?? "non configuré"}` : undefined}>
            <span className={`status-dot ${health === "ko" ? "ko" : health ? "ok" : ""}`} aria-hidden="true" />
            <span className="api-label">{health === "ko" ? "API hors ligne" : health ? `API · ${health.embedding_backend}` : "Connexion à l'API…"}</span>
          </span>
          <IconButton icon={theme === "dark" ? "sun" : "moon"} label={theme === "dark" ? "Passer en thème clair" : "Passer en thème sombre"} onClick={toggle} />
        </header>
        <main id="contenu" className="content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
