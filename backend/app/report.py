"""Rapport HTML téléchargeable et imprimable (BNF5, Objectif 4)."""
from __future__ import annotations

from datetime import datetime
from html import escape

from .schemas import AnalysisResult, MatchStatus, Recommendations

STATUS_COLORS = {
    MatchStatus.COUVERT: ("#e7f5ec", "#1e6b3a"),
    MatchStatus.PARTIEL: ("#fdf3e1", "#8a5a00"),
    MatchStatus.ABSENT: ("#fbe9e9", "#9b2c2c"),
}
SUB_LABELS = {
    "hard_skills": "Compétences techniques",
    "experience": "Expérience",
    "formation": "Formation",
    "soft_skills": "Soft skills",
}


def _ul(items: list[str]) -> str:
    return "<ul>" + "".join(f"<li>{escape(i)}</li>" for i in items) + "</ul>" if items else "<p>—</p>"


def build_html_report(analysis: AnalysisResult, reco: Recommendations | None = None) -> str:
    rows = []
    for m in analysis.gap_analysis:
        bg, fg = STATUS_COLORS[m.status]
        rows.append(
            "<tr>"
            f"<td>{escape(m.required)}</td>"
            f"<td>{'Soft skill' if m.type.value == 'soft_skill' else 'Technique'}</td>"
            f"<td>{'Souhaitée' if m.optional else 'Obligatoire'}</td>"
            f"<td><span class='badge' style='background:{bg};color:{fg}'>{m.status.value}</span></td>"
            f"<td>{escape(m.reason)}</td>"
            "</tr>"
        )

    sub_rows = []
    weights = analysis.weights.model_dump()
    for key, label in SUB_LABELS.items():
        value = getattr(analysis.sub_scores, key)
        shown = "non évalué" if value is None else f"{value:.0f} / 100"
        sub_rows.append(f"<tr><td>{label}</td><td>{weights[key]:.0%}</td><td>{shown}</td></tr>")

    reco_html = ""
    if reco:
        reformulations = "".join(
            f"<div class='card'><p><b>Avant :</b> {escape(r.avant)}</p><p><b>Après :</b> {escape(r.apres)}</p></div>"
            for r in reco.reformulations
        ) or "<p>—</p>"
        actions = "".join(
            f"<tr><td>{escape(a.competence)}</td><td>{escape(a.type)}</td><td>{escape(a.action)}</td>"
            f"<td>{escape(a.duree_estimee or '')}</td></tr>"
            for a in reco.plan_action
        )
        reco_html = f"""
        <h2>Synthèse</h2><p>{escape(reco.synthese)}</p>
        <div class="cols"><div><h3>Forces</h3>{_ul(reco.forces)}</div>
        <div><h3>Lacunes prioritaires</h3>{_ul(reco.lacunes_prioritaires)}</div></div>
        <h2>Reformulations proposées</h2>{reformulations}
        <h2>Feuille de route</h2>
        <table><tr><th>Compétence</th><th>Type</th><th>Action</th><th>Durée</th></tr>{actions}</table>
        <p class="muted">Recommandations générées par : {'modèle de langage' if reco.source == 'llm' else 'règles (LLM indisponible)'}</p>
        """

    return f"""<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>Bilan d'adéquation CV / offre</title>
<style>
body {{ font-family: Arial, Helvetica, sans-serif; color:#1f2937; max-width: 900px; margin: 32px auto; padding: 0 16px; }}
h1 {{ color:#1e3a5f; margin-bottom:4px }} h2 {{ color:#1e3a5f; border-bottom:2px solid #0e9fc8; padding-bottom:4px; margin-top:28px }}
.score {{ font-size:48px; font-weight:bold; color:#1e3a5f }} .muted {{ color:#6b7280; font-size:13px }}
table {{ border-collapse: collapse; width:100%; font-size:14px }} th, td {{ border:1px solid #e5e7eb; padding:6px 8px; text-align:left; vertical-align:top }}
th {{ background:#f3f4f6 }} .badge {{ padding:2px 8px; border-radius:10px; font-size:12px; font-weight:bold }}
.cols {{ display:flex; gap:24px }} .cols > div {{ flex:1 }} .card {{ border:1px solid #e5e7eb; border-radius:8px; padding:8px 12px; margin:8px 0 }}
@media print {{ body {{ margin:0 }} h2 {{ page-break-after: avoid }} tr {{ page-break-inside: avoid }} }}
</style></head><body>
<h1>Bilan d'adéquation CV / offre d'emploi</h1>
<p class="muted">Généré le {datetime.now():%d/%m/%Y à %H:%M} — Analyseur Intelligent de CV (EMSI 5AISDR G8)</p>
<h2>Score global</h2>
<div class="score">{analysis.global_score:.0f} / 100</div>
<table><tr><th>Critère</th><th>Poids</th><th>Score</th></tr>{''.join(sub_rows)}</table>
<h2>Matrice des écarts</h2>
<table><tr><th>Compétence exigée</th><th>Type</th><th>Priorité</th><th>État</th><th>Justification</th></tr>{''.join(rows)}</table>
{reco_html}
</body></html>"""
