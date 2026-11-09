import type { MatchStatus, Role, Weights } from "./types";

export const ROLE_LABELS: Record<Role, string> = {
  candidat: "Candidat / étudiant",
  recruteur: "Recruteur / RH",
  conseiller: "Conseiller pédagogique",
};

export const WEIGHT_LABELS: Record<keyof Weights, string> = {
  hard_skills: "Compétences techniques",
  experience: "Expérience",
  formation: "Formation",
  soft_skills: "Soft skills",
};

export const DEFAULT_WEIGHTS: Weights = { hard_skills: 0.5, experience: 0.25, formation: 0.15, soft_skills: 0.1 };

export const STATUS_ORDER: Record<MatchStatus, number> = { Absent: 0, Partiel: 1, Couvert: 2 };

export function scoreTone(score: number): "good" | "mid" | "low" {
  return score >= 75 ? "good" : score >= 50 ? "mid" : "low";
}

export function scoreLevel(score: number): string {
  return score >= 75 ? "Adéquation forte" : score >= 50 ? "Adéquation moyenne" : "Adéquation faible";
}

export function formatDate(iso: string, withTime = false): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit", month: "short", year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

/** Normalise des poids pour que leur somme vaille exactement 1. */
export function normalizeWeights(w: Weights): Weights {
  const total = w.hard_skills + w.experience + w.formation + w.soft_skills || 1;
  const r = (v: number) => Math.round((v / total) * 10000) / 10000;
  const n = { hard_skills: 0, experience: r(w.experience), formation: r(w.formation), soft_skills: r(w.soft_skills) };
  n.hard_skills = Math.round((1 - n.experience - n.formation - n.soft_skills) * 10000) / 10000;
  return n;
}

/** Même calcul que le backend : les critères non évalués voient leur poids redistribué. */
export function computeGlobal(sub: { [K in keyof Weights]: number | null }, w: Weights): number {
  let total = 0;
  let sum = 0;
  (Object.keys(w) as (keyof Weights)[]).forEach((k) => {
    const v = sub[k];
    if (v !== null && w[k] > 0) {
      total += w[k];
      sum += w[k] * v;
    }
  });
  return total ? Math.round((sum / total) * 10) / 10 : 0;
}

export function plural(n: number, word: string, pluralWord = `${word}s`): string {
  return `${n} ${n > 1 ? pluralWord : word}`;
}
