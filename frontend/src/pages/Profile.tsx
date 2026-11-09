// Profil : informations du compte, modification, changement de mot de passe.
import { useEffect, useState, type FormEvent } from "react";
import { Alert, Button, Card, Field, PageHeader } from "../components/ui";
import { useToast } from "../components/toast";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDate, initials, ROLE_LABELS } from "../lib/format";
import type { Role } from "../lib/types";

export function ProfilePage() {
  const { user, setUser, logout } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user?.full_name ?? "");
  const [role, setRole] = useState<Role>(user?.role ?? "candidat");
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);

  const [pwd, setPwd] = useState({ current: "", next: "", confirm: "" });
  const [pwdErrors, setPwdErrors] = useState<{ next?: string; confirm?: string }>({});
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdSaving, setPwdSaving] = useState(false);

  useEffect(() => {
    api.stats().then((s) => setCount(s.total_analyses)).catch(() => setCount(null));
  }, []);

  if (!user) return null;

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) { setNameError("Le nom doit contenir au moins 2 caractères."); return; }
    setNameError(null);
    setSaving(true);
    try {
      setUser(await api.updateMe({ full_name: name.trim(), role }));
      toast("Profil mis à jour.");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof pwdErrors = {};
    if (pwd.next.length < 8) errs.next = "8 caractères minimum.";
    if (pwd.confirm !== pwd.next) errs.confirm = "Les mots de passe ne correspondent pas.";
    setPwdErrors(errs);
    if (Object.keys(errs).length) return;
    setPwdSaving(true);
    setPwdError(null);
    try {
      await api.changePassword(pwd.current, pwd.next);
      setPwd({ current: "", next: "", confirm: "" });
      toast("Mot de passe modifié.");
    } catch (err) {
      setPwdError((err as Error).message);
    } finally {
      setPwdSaving(false);
    }
  };

  return (
    <>
      <PageHeader title="Mon profil" subtitle="Gérez les informations de votre compte." />
      <div className="grid grid-1-2" style={{ alignItems: "start" }}>
        <Card>
          <div className="stack" style={{ alignItems: "center", textAlign: "center" }}>
            <span className="avatar lg">{initials(user.full_name)}</span>
            <div>
              <h2>{user.full_name}</h2>
              <p className="muted small">{user.email}</p>
            </div>
            <span className="badge badge-primary">{ROLE_LABELS[user.role]}</span>
            <dl className="kv" style={{ alignSelf: "stretch", textAlign: "left" }}>
              <dt>Membre depuis</dt><dd>{formatDate(user.created_at)}</dd>
              <dt>Analyses</dt><dd className="num">{count ?? "—"}</dd>
            </dl>
            <Button variant="secondary" icon="logout" block onClick={logout}>Se déconnecter</Button>
          </div>
        </Card>
        <div className="stack">
          <Card title="Informations personnelles">
            <form className="form" onSubmit={saveProfile} noValidate>
              <Field label="Nom complet" error={nameError}>
                {(p) => <input className="input" value={name} autoComplete="name" onChange={(e) => setName(e.target.value)} {...p} />}
              </Field>
              <Field label="Adresse e-mail" hint="L'adresse e-mail ne peut pas être modifiée.">
                {(p) => <input className="input" value={user.email} disabled {...p} />}
              </Field>
              <Field label="Profil d'utilisation">
                {(p) => (
                  <select className="select" value={role} onChange={(e) => setRole(e.target.value as Role)} {...p}>
                    {(Object.keys(ROLE_LABELS) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                )}
              </Field>
              <div><Button type="submit" loading={saving}>Enregistrer</Button></div>
            </form>
          </Card>
          <Card title="Mot de passe">
            <form className="form" onSubmit={savePassword} noValidate>
              {pwdError && <Alert>{pwdError}</Alert>}
              <Field label="Mot de passe actuel">
                {(p) => <input className="input" type="password" autoComplete="current-password" value={pwd.current}
                  onChange={(e) => setPwd({ ...pwd, current: e.target.value })} {...p} />}
              </Field>
              <div className="grid grid-2">
                <Field label="Nouveau mot de passe" error={pwdErrors.next} hint="8 caractères minimum.">
                  {(p) => <input className="input" type="password" autoComplete="new-password" value={pwd.next}
                    onChange={(e) => setPwd({ ...pwd, next: e.target.value })} {...p} />}
                </Field>
                <Field label="Confirmer" error={pwdErrors.confirm}>
                  {(p) => <input className="input" type="password" autoComplete="new-password" value={pwd.confirm}
                    onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} {...p} />}
                </Field>
              </div>
              <div><Button type="submit" variant="secondary" loading={pwdSaving}>Changer le mot de passe</Button></div>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
