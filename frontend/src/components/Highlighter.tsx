// Surligne dans un texte les entités reconnues par le NER (hard skills / soft skills).
import { useMemo } from "react";
import type { Skill } from "../lib/types";

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function Highlighter({ text, skills }: { text: string; skills: Skill[] }) {
  const parts = useMemo(() => {
    const surfaceToSkill = new Map<string, Skill>();
    skills.forEach((s) => s.mentions.forEach((m) => m.trim() && surfaceToSkill.set(m.toLowerCase(), s)));
    const surfaces = [...surfaceToSkill.keys()].sort((a, b) => b.length - a.length);
    if (!surfaces.length) return [{ text, skill: null as Skill | null }];
    const re = new RegExp(`(?<![\\p{L}\\p{N}])(${surfaces.map(escapeRegExp).join("|")})(?![\\p{L}\\p{N}+#])`, "giu");
    const out: { text: string; skill: Skill | null }[] = [];
    let last = 0;
    for (const m of text.matchAll(re)) {
      const i = m.index ?? 0;
      if (i > last) out.push({ text: text.slice(last, i), skill: null });
      out.push({ text: m[0], skill: surfaceToSkill.get(m[0].toLowerCase()) ?? null });
      last = i + m[0].length;
    }
    out.push({ text: text.slice(last), skill: null });
    return out;
  }, [text, skills]);

  return (
    <div className="highlight-text" tabIndex={0} aria-label="Texte analysé avec les entités surlignées">
      {parts.map((p, i) =>
        p.skill ? (
          <mark key={i} className={`ent ent-${p.skill.type === "hard_skill" ? "hard" : "soft"}`} title={`${p.skill.name}${p.skill.category ? ` · ${p.skill.category}` : ""}`}>
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </div>
  );
}
