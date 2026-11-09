// Pages de connexion et d'inscription.
import { useState, type FormEvent, type ReactNode } from "react";
import { Icon, type IconName } from "../components/Icon";
import { Alert, Button, Field, IconButton } from "../components/ui";
import { useTheme } from "../components/Layout";
import { useAuth } from "../lib/auth";
import { Link, useRouter } from "../lib/router";
import { ROLE_LABELS } from "../lib/format";
import type { Role } from "../lib/types";

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: "scan", title: "Extraction intelligente", text: "Compétences, diplômes et expériences reconnus automatiquement (NER spaCy)." },
  { icon: "compare", title: "Appariement sémantique", text: "Les synonymes techniques sont compris grâce aux embeddings MiniLM." },
  { icon: "sparkles", title: "Recommandations ciblées", text: "Reformulations du CV et feuille de route générées par un LLM." },
];

function AuthShell({ children }: { children: ReactNode }) {
  const { theme, toggle } = useTheme();
  return (
    <div className="auth">
      <aside className="auth-aside">
        <div className="brand" style={{ padding: 0 }}>
          <span className="brand-mark"><Icon name="target" size={20} /></span>
          <span>
            <span className="brand-name" style={{ display: "block" }}>CV Match</span>
            <span className="brand-sub">Analyseur intelligent de CV</span>
          </span>
        </div>
        <div>
          <h2>Mesurez l'adéquation entre un CV et une offre d'emploi en quelques secondes.</h2>
          <p>Extraire, évaluer, guider : un score sur 100, les compétences manquantes et un plan d'action concret.</p>
        </div>
        <ul className="auth-features">
          {FEATURES.map((f) => (
            <li key={f.title}>
              <span className="fi"><Icon name={f.icon} /></span>
              <span><strong>{f.title}</strong><span>{f.text}</span></span>
            </li>
          ))}
        </ul>
        <span style={{ fontSize: 13, color: "#a5b4fc", position: "relative", zIndex: 1 }}>EMSI · Module IA & Data Science · 5AISDR G8</span>
      </aside>
      <main className="auth-main" style={{ position: "relative" }}>
        <div className="auth-top">
          <IconButton icon={theme === "dark" ? "sun" : "moon"} label={theme === "dark" ? "Passer en thème clair" : "Passer en thème sombre"} onClick={toggle} />
        </div>
        {children}
      </main>
    </div>
  );
}

function PasswordInput({ value, onChange, autoComplete, fieldProps }: {
  value: string; onChange: (v: string) => void; autoComplete: string; fieldProps: Record<string, unknown>;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="input-wrap">
      <input className="input" type={visible ? "text" : "password"} value={value} autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)} {...fieldProps} />
      <span className="input-action">
        <IconButton type="button" icon={visible ? "eyeOff" : "eye"} label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          onClick={() => setVisible((v) => !v)} />
      </span>
    </div>
  );
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function LoginPage() {
  const { login } = useAuth();
  const { navigate, search } = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!EMAIL_RE.test(email)) next.email = "Saisissez une adresse e-mail valide.";
    if (!password) next.password = "Saisissez votre mot de passe.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setLoading(true);
    setFormError(null);
    try {
      await login(email, password);
      const target = search.get("suite");
      navigate(target && target.startsWith("/") ? target : "/", { replace: true });
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <div className="auth-card">
        <div className="stack-sm">
          <h1>Connexion</h1>
          <p className="muted">Heureux de vous revoir. Connectez-vous pour accéder à vos analyses.</p>
        </div>
        {formError && <Alert>{formError}</Alert>}
        <form className="form" onSubmit={submit} noValidate>
          <Field label="Adresse e-mail" error={errors.email}>
            {(p) => <input className="input" type="email" autoComplete="email" inputMode="email" value={email}
              onChange={(e) => setEmail(e.target.value)} {...p} />}
          </Field>
          <Field label="Mot de passe" error={errors.password}>
            {(p) => <PasswordInput value={password} onChange={setPassword} autoComplete="current-password" fieldProps={p} />}
          </Field>
          <Button type="submit" size="lg" block loading={loading}>{loading ? "Connexion…" : "Se connecter"}</Button>
        </form>
        <p className="muted" style={{ textAlign: "center" }}>
          Pas encore de compte ? <Link to="/inscription">Créer un compte</Link>
        </p>
      </div>
    </AuthShell>
  );
}

const ROLE_HINTS: Record<Role, string> = {
  candidat: "Auditer mon CV",
  recruteur: "Préqualifier des profils",
  conseiller: "Orienter des étudiants",
};

export function RegisterPage() {
  const { register } = useAuth();
  const { navigate } = useRouter();
  const [form, setForm] = useState({ full_name: "", email: "", password: "", confirm: "", role: "candidat" as Role });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof form, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (form.full_name.trim().length < 2) next.full_name = "Indiquez votre nom (2 caractères minimum).";
    if (!EMAIL_RE.test(form.email)) next.email = "Saisissez une adresse e-mail valide.";
    if (form.password.length < 8) next.password = "Le mot de passe doit contenir au moins 8 caractères.";
    if (form.confirm !== form.password) next.confirm = "Les deux mots de passe ne correspondent pas.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setLoading(true);
    setFormError(null);
    try {
      await register({ email: form.email, full_name: form.full_name, password: form.password, role: form.role });
      navigate("/", { replace: true });
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <div className="auth-card wide">
        <div className="stack-sm">
          <h1>Créer un compte</h1>
          <p className="muted">Gratuit. Vos analyses restent privées et liées à votre compte.</p>
        </div>
        {formError && <Alert>{formError}</Alert>}
        <form className="form" onSubmit={submit} noValidate>
          <Field label="Nom complet" error={errors.full_name}>
            {(p) => <input className="input" autoComplete="name" value={form.full_name} onChange={(e) => set("full_name")(e.target.value)} {...p} />}
          </Field>
          <Field label="Adresse e-mail" error={errors.email}>
            {(p) => <input className="input" type="email" autoComplete="email" value={form.email} onChange={(e) => set("email")(e.target.value)} {...p} />}
          </Field>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="field">
            <legend className="label" style={{ marginBottom: 6 }}>Je suis…</legend>
            <div className="radio-cards">
              {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                <label key={r} className="radio-card">
                  <input type="radio" name="role" value={r} checked={form.role === r} onChange={() => set("role")(r)} />
                  <strong>{ROLE_LABELS[r]}</strong>
                  <span>{ROLE_HINTS[r]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Mot de passe" hint="8 caractères minimum." error={errors.password}>
            {(p) => <PasswordInput value={form.password} onChange={set("password")} autoComplete="new-password" fieldProps={p} />}
          </Field>
          <Field label="Confirmer le mot de passe" error={errors.confirm}>
            {(p) => <PasswordInput value={form.confirm} onChange={set("confirm")} autoComplete="new-password" fieldProps={p} />}
          </Field>
          <Button type="submit" size="lg" block loading={loading}>{loading ? "Création du compte…" : "Créer mon compte"}</Button>
        </form>
        <p className="muted" style={{ textAlign: "center" }}>
          Déjà inscrit ? <Link to="/connexion">Se connecter</Link>
        </p>
      </div>
    </AuthShell>
  );
}
