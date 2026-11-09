// Composants d'interface réutilisables.
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import type { MatchStatus } from "../lib/types";
import { scoreTone } from "../lib/format";

// ---------------------------------------------------------------- Bouton
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: IconName;
  block?: boolean;
};

export function Button({ variant = "primary", size = "md", loading, icon, block, children, className = "", disabled, ...rest }: ButtonProps) {
  const cls = ["btn", `btn-${variant}`, size !== "md" ? `btn-${size}` : "", block ? "btn-block" : "", className].join(" ");
  return (
    <button className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <span className="spinner" aria-hidden="true" /> : icon ? <Icon name={icon} size={size === "sm" ? 16 : 18} /> : null}
      {children}
    </button>
  );
}

export function IconButton({ icon, label, className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string }) {
  return (
    <button className={`btn btn-ghost icon-btn ${className}`} aria-label={label} title={label} {...rest}>
      <Icon name={icon} />
    </button>
  );
}

// ---------------------------------------------------------------- Champ de formulaire
interface FieldProps {
  label: string;
  hint?: string;
  error?: string | null;
  optional?: boolean;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => ReactNode;
}

export function Field({ label, hint, error, optional, children }: FieldProps) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label} {optional && <span className="opt">(optionnel)</span>}
      </label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {hint && !error && <span id={`${id}-hint`} className="hint">{hint}</span>}
      {error && (
        <span id={`${id}-error`} className="error-text" role="alert">
          <Icon name="alert" size={14} /> {error}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Cartes et en-têtes
export function Card({ title, subtitle, actions, children, flush, className = "" }: {
  title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; flush?: boolean; className?: string;
}) {
  return (
    <section className={`card ${flush ? "card-flush" : ""} ${className}`}>
      {(title || actions) && (
        <header className="card-header">
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      {flush ? children : <div className="card-body">{children}</div>}
    </section>
  );
}

export function PageHeader({ title, subtitle, actions, breadcrumb }: { title: string; subtitle?: ReactNode; actions?: ReactNode; breadcrumb?: ReactNode }) {
  useEffect(() => {
    document.title = `${title} · CV Match`;
  }, [title]);
  return (
    <div className="page-header">
      <div>
        {breadcrumb && <div className="breadcrumb">{breadcrumb}</div>}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- Badges
const STATUS_ICON: Record<MatchStatus, IconName> = { Couvert: "checkCircle", Partiel: "partial", Absent: "xCircle" };

export function StatusBadge({ status }: { status: MatchStatus }) {
  return (
    <span className={`badge badge-${status.toLowerCase()}`}>
      <Icon name={STATUS_ICON[status]} size={14} /> {status}
    </span>
  );
}

export function ScorePill({ score }: { score: number }) {
  return <span className={`score-pill score-${scoreTone(score)}`}>{Math.round(score)}</span>;
}

export function Progress({ value, tone, label, small }: { value: number; tone?: "good" | "mid" | "low"; label: string; small?: boolean }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={`progress ${small ? "sm" : ""} ${tone ? `tone-${tone}` : ""}`} role="progressbar"
      aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)}>
      <span style={{ width: `${v}%` }} />
    </div>
  );
}

// ---------------------------------------------------------------- États
export function Spinner({ label = "Chargement" }: { label?: string }) {
  return (
    <div className="row" role="status" style={{ justifyContent: "center", padding: 40 }}>
      <span className="spinner lg" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: IconName; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon name={icon} size={26} /></div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}

export function Alert({ tone = "error", children }: { tone?: "error" | "info" | "warning" | "success"; children: ReactNode }) {
  const icon: IconName = tone === "error" ? "xCircle" : tone === "warning" ? "alert" : tone === "success" ? "checkCircle" : "info";
  return (
    <div className={`alert alert-${tone}`} role={tone === "error" ? "alert" : "status"}>
      <Icon name={icon} size={18} />
      <div>{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------- Onglets accessibles
export function Tabs<T extends string>({ tabs, value, onChange, label }: {
  tabs: { id: T; label: string; count?: number; icon?: IconName }[]; value: T; onChange: (id: T) => void; label: string;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={label}
      onKeyDown={(e) => {
        const i = tabs.findIndex((t) => t.id === value);
        if (e.key === "ArrowRight") onChange(tabs[(i + 1) % tabs.length].id);
        if (e.key === "ArrowLeft") onChange(tabs[(i - 1 + tabs.length) % tabs.length].id);
      }}>
      {tabs.map((t) => (
        <button key={t.id} id={`tab-${t.id}`} role="tab" className="tab" aria-selected={t.id === value}
          aria-controls={`panel-${t.id}`} tabIndex={t.id === value ? 0 : -1} onClick={() => onChange(t.id)}>
          {t.icon && <Icon name={t.icon} size={16} />}
          {t.label}
          {t.count !== undefined && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Confirmation
export function ConfirmDialog({ open, title, text, confirmLabel, onConfirm, onCancel, loading }: {
  open: boolean; title: string; text: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void; loading?: boolean;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title" aria-describedby="dlg-text"
        onClick={(e) => e.stopPropagation()}>
        <h2 id="dlg-title">{title}</h2>
        <p id="dlg-text" className="muted">{text}</p>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button ref={cancelRef} className="btn btn-secondary" onClick={onCancel}>
            Annuler
          </button>
          <Button variant="danger" icon="trash" loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
