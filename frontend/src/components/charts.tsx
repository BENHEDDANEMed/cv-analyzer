// Visualisations en SVG pur : jauge de score, courbe d'évolution, barres empilées.
import { useId } from "react";
import { formatDate, scoreLevel, scoreTone } from "../lib/format";
import type { StatusCounts } from "../lib/types";

const TONE_VAR = { good: "var(--success)", mid: "var(--warning)", low: "var(--danger)" };

/** Jauge semi-circulaire 0-100. La couleur est doublée d'un libellé texte (pas seulement la couleur). */
export function ScoreGauge({ score, caption }: { score: number; caption?: string }) {
  const tone = scoreTone(score);
  const r = 80;
  const circumference = Math.PI * r;
  const filled = (Math.max(0, Math.min(100, score)) / 100) * circumference;
  return (
    <div className="gauge">
      <svg viewBox="0 0 200 120" role="img" aria-label={`Score global ${Math.round(score)} sur 100, ${scoreLevel(score)}`}>
        <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="var(--surface-2)" strokeWidth="16" strokeLinecap="round" />
        <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke={TONE_VAR[tone]} strokeWidth="16" strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`} style={{ transition: "stroke-dasharray 600ms cubic-bezier(.2,0,0,1)" }} />
        <text x="100" y="92" textAnchor="middle" className="gauge-value">{Math.round(score)}</text>
        <text x="100" y="114" textAnchor="middle" className="gauge-unit">sur 100</text>
      </svg>
      <span className={`badge badge-${tone === "good" ? "couvert" : tone === "mid" ? "partiel" : "absent"}`}>{scoreLevel(score)}</span>
      {caption && <span className="subtle">{caption}</span>}
    </div>
  );
}

/** Courbe du score des dernières analyses (axe 0-100, points accessibles avec <title>). */
export function ScoreLineChart({ points }: { points: { score: number; title: string; created_at: string }[] }) {
  const gradId = useId().replace(/:/g, "");
  const W = 640, H = 220, L = 36, R = 16, T = 16, B = 30;
  const n = points.length;
  const x = (i: number) => (n === 1 ? L + (W - L - R) / 2 : L + (i * (W - L - R)) / (n - 1));
  const y = (v: number) => T + ((100 - v) * (H - T - B)) / 100;
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.score).toFixed(1)}`).join(" ");
  const area = n > 1 ? `${line} L${x(n - 1)} ${y(0)} L${x(0)} ${y(0)} Z` : "";
  return (
    <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
      aria-label={`Évolution du score sur ${n} analyses. Dernier score : ${points[n - 1]?.score ?? 0}.`}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 25, 50, 75, 100].map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeDasharray={v ? "3 4" : undefined} />
          <text x={L - 8} y={y(v) + 4} textAnchor="end">{v}</text>
        </g>
      ))}
      {area && <path d={area} fill={`url(#${gradId})`} />}
      <path d={line} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.score)} r="5" fill="var(--surface)" stroke="var(--primary)" strokeWidth="2.5">
            <title>{`${p.title} — ${Math.round(p.score)}/100 (${formatDate(p.created_at)})`}</title>
          </circle>
          {(n <= 8 || i === 0 || i === n - 1) && (
            <text x={x(i)} y={H - 8} textAnchor="middle">{formatDate(p.created_at).replace(/ \d{4}$/, "")}</text>
          )}
        </g>
      ))}
    </svg>
  );
}

/** Barre empilée Couvert / Partiel / Absent avec légende chiffrée. */
export function StatusBar({ counts }: { counts: StatusCounts }) {
  const total = counts.couvert + counts.partiel + counts.absent || 1;
  const items = [
    { key: "couvert", label: "Couvertes", color: "var(--success)", value: counts.couvert },
    { key: "partiel", label: "Partielles", color: "var(--warning)", value: counts.partiel },
    { key: "absent", label: "Absentes", color: "var(--danger)", value: counts.absent },
  ];
  return (
    <div className="stack-sm">
      <div className="stacked" role="img"
        aria-label={items.map((i) => `${i.label} : ${i.value}`).join(", ")}>
        {items.map((i) => (
          <span key={i.key} style={{ width: `${(i.value / total) * 100}%`, background: i.color }} />
        ))}
      </div>
      <div className="legend">
        {items.map((i) => (
          <span key={i.key} className="legend-item">
            <span className="dot" style={{ background: i.color }} />
            {i.label} <strong className="num" style={{ color: "var(--text)" }}>{i.value}</strong>
            <span className="subtle">({Math.round((i.value / total) * 100)} %)</span>
          </span>
        ))}
      </div>
    </div>
  );
}
