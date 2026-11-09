// Nouvelle analyse : dépôt du CV, saisie de l'offre, pondération, lancement.
import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { Icon } from "../components/Icon";
import { Alert, Button, Card, Field, IconButton, PageHeader } from "../components/ui";
import { useToast } from "../components/toast";
import { api } from "../lib/api";
import { useRouter } from "../lib/router";
import { DEFAULT_WEIGHTS, formatBytes, normalizeWeights, WEIGHT_LABELS } from "../lib/format";
import { SAMPLE_CV, SAMPLE_JOB } from "../lib/samples";
import type { Weights } from "../lib/types";

const MAX_MB = 5;
const CV_TYPES = [".pdf", ".docx", ".txt"];

function extOf(name: string) {
  return name.slice(name.lastIndexOf(".")).toLowerCase();
}

function FileDrop({ file, onFile, accept, label, error }: {
  file: File | null; onFile: (f: File | null) => void; accept: string[]; label: string; error?: string | null;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  };
  if (file) {
    return (
      <div className="file-card">
        <span className="file-icon"><Icon name="file" /></span>
        <div className="grow">
          <strong>{file.name}</strong>
          <span className="subtle">{formatBytes(file.size)}</span>
        </div>
        <IconButton icon="x" label={`Retirer ${file.name}`} type="button" onClick={() => onFile(null)} />
      </div>
    );
  }
  return (
    <>
      <div className={`dropzone ${drag ? "drag" : ""}`} role="button" tabIndex={0} aria-label={label}
        aria-invalid={error ? true : undefined}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), input.current?.click())}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}>
        <span className="dz-icon"><Icon name="upload" /></span>
        <strong>Glissez-déposez le fichier ici</strong>
        <span className="subtle">ou <span style={{ color: "var(--primary)", fontWeight: 600 }}>parcourez vos fichiers</span> · {accept.join(", ").toUpperCase().replace(/\./g, "")} · {MAX_MB} Mo max.</span>
      </div>
      <input ref={input} type="file" accept={accept.join(",")} hidden onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      {error && <span className="error-text" role="alert"><Icon name="alert" size={14} /> {error}</span>}
    </>
  );
}

export function NewAnalysisPage() {
  const { navigate, search } = useRouter();
  const toast = useToast();
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [jobMode, setJobMode] = useState<"texte" | "fichier">("texte");
  const [jobText, setJobText] = useState("");
  const [jobFile, setJobFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [showWeights, setShowWeights] = useState(false);
  const [errors, setErrors] = useState<{ cv?: string; job?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadSample = () => {
    setCvFile(new File([SAMPLE_CV], "cv_exemple_sara.txt", { type: "text/plain" }));
    setJobMode("texte");
    setJobText(SAMPLE_JOB);
    setTitle("Stage PFE Data Scientist NLP");
    setCompany("Entreprise exemple");
    setErrors({});
    toast("Exemple chargé : un CV et une offre de démonstration.", "info");
  };

  const sampleLoaded = useRef(false);
  useEffect(() => {
    if (search.get("exemple") === "1" && !sampleLoaded.current) {
      sampleLoaded.current = true; // StrictMode exécute l'effet deux fois en développement
      loadSample();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validateFile = (f: File | null, accept: string[]): string | undefined => {
    if (!f) return undefined;
    if (!accept.includes(extOf(f.name))) return `Format non pris en charge. Formats acceptés : ${accept.join(", ")}.`;
    if (f.size > MAX_MB * 1024 * 1024) return `Fichier trop volumineux (${formatBytes(f.size)}). Maximum ${MAX_MB} Mo.`;
    return undefined;
  };

  const norm = normalizeWeights(weights);
  const jobReady = jobMode === "texte" ? jobText.trim().length >= 30 : !!jobFile;
  const checklist = [
    { done: !!cvFile && !validateFile(cvFile, CV_TYPES), label: "CV ajouté" },
    { done: jobReady, label: "Offre d'emploi renseignée" },
    { done: true, label: `Pondération : ${Math.round(norm.hard_skills * 100)} / ${Math.round(norm.experience * 100)} / ${Math.round(norm.formation * 100)} / ${Math.round(norm.soft_skills * 100)}` },
  ];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    next.cv = cvFile ? validateFile(cvFile, CV_TYPES) : "Ajoutez le CV à analyser.";
    if (jobMode === "texte" && jobText.trim().length < 30) next.job = "Collez le texte de l'offre (au moins 30 caractères).";
    if (jobMode === "fichier") next.job = jobFile ? validateFile(jobFile, CV_TYPES) : "Ajoutez le fichier de l'offre.";
    const clean = Object.fromEntries(Object.entries(next).filter(([, v]) => v)) as typeof errors;
    setErrors(clean);
    if (Object.keys(clean).length) return;

    const form = new FormData();
    form.append("cv_file", cvFile!);
    if (jobMode === "texte") form.append("job_text", jobText);
    else form.append("job_file", jobFile!);
    form.append("weights", JSON.stringify(norm));
    if (title.trim()) form.append("title", title.trim());
    if (company.trim()) form.append("company", company.trim());

    setLoading(true);
    setFormError(null);
    try {
      const rec = await api.createAnalysis(form);
      const ms = rec.result.timings_ms.total;
      toast(`Analyse terminée en ${ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`}.`);
      navigate(`/analyses/${rec.id}`);
    } catch (err) {
      setFormError((err as Error).message);
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeader title="Nouvelle analyse" subtitle="Comparez un CV à une offre d'emploi : extraction, score d'adéquation et écarts."
        actions={<Button variant="secondary" icon="sparkles" type="button" onClick={loadSample}>Charger l'exemple</Button>} />

      <form onSubmit={submit} noValidate className="grid grid-2-1" style={{ alignItems: "start" }}>
        <div className="stack">
          {formError && <Alert>{formError}</Alert>}
          <Card title={<span className="step-title"><span className="step-num">1</span>Le CV</span>}
            subtitle="PDF, DOCX ou TXT. Les PDF scannés (images) ne sont pas encore pris en charge.">
            <FileDrop file={cvFile} accept={CV_TYPES} label="Déposer le CV" error={errors.cv}
              onFile={(f) => { setCvFile(f); setErrors((e) => ({ ...e, cv: validateFile(f, CV_TYPES) })); }} />
          </Card>

          <Card title={<span className="step-title"><span className="step-num">2</span>L'offre d'emploi</span>}
            subtitle="Collez la fiche de poste ou importez-la."
            actions={
              <div className="segmented" role="group" aria-label="Source de l'offre">
                <button type="button" aria-pressed={jobMode === "texte"} onClick={() => setJobMode("texte")}>Texte</button>
                <button type="button" aria-pressed={jobMode === "fichier"} onClick={() => setJobMode("fichier")}>Fichier</button>
              </div>
            }>
            {jobMode === "texte" ? (
              <Field label="Texte de l'offre" error={errors.job} hint={`${jobText.length} caractères · indiquez les missions et le profil recherché.`}>
                {(p) => <textarea className="textarea" rows={12} value={jobText} placeholder="Ex. Missions : … Profil recherché : …"
                  onChange={(e) => setJobText(e.target.value)} {...p} />}
              </Field>
            ) : (
              <FileDrop file={jobFile} accept={CV_TYPES} label="Déposer l'offre" error={errors.job}
                onFile={(f) => { setJobFile(f); setErrors((e) => ({ ...e, job: validateFile(f, CV_TYPES) })); }} />
            )}
          </Card>

          <Card title={<span className="step-title"><span className="step-num">3</span>Informations</span>} subtitle="Pour retrouver facilement l'analyse dans l'historique.">
            <div className="grid grid-2">
              <Field label="Intitulé du poste" optional hint="Sinon, la 1re ligne de l'offre est utilisée.">
                {(p) => <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} {...p} />}
              </Field>
              <Field label="Entreprise" optional>
                {(p) => <input className="input" value={company} onChange={(e) => setCompany(e.target.value)} {...p} />}
              </Field>
            </div>
          </Card>

          <Card title={<span className="step-title"><span className="step-num">4</span>Pondération du score</span>}
            subtitle="Par défaut : formule du cahier des charges (50 / 25 / 15 / 10)."
            actions={<Button type="button" variant="ghost" size="sm" aria-expanded={showWeights} onClick={() => setShowWeights((v) => !v)}>
              {showWeights ? "Masquer" : "Personnaliser"} <Icon name="chevronDown" size={16} style={{ transform: showWeights ? "rotate(180deg)" : undefined }} />
            </Button>}>
            {showWeights ? (
              <div className="stack">
                {(Object.keys(WEIGHT_LABELS) as (keyof Weights)[]).map((k) => (
                  <div key={k} className="field">
                    <div className="row-between">
                      <label className="label" htmlFor={`w-${k}`}>{WEIGHT_LABELS[k]}</label>
                      <span className="num muted">{Math.round(norm[k] * 100)} %</span>
                    </div>
                    <input id={`w-${k}`} type="range" min={0} max={100} step={5} value={Math.round(weights[k] * 100)}
                      onChange={(e) => setWeights((w) => ({ ...w, [k]: Number(e.target.value) / 100 }))} />
                  </div>
                ))}
                <div className="row-between">
                  <span className="subtle">Les poids sont normalisés automatiquement pour totaliser 100 %.</span>
                  <Button type="button" variant="ghost" size="sm" icon="refresh" onClick={() => setWeights(DEFAULT_WEIGHTS)}>Réinitialiser</Button>
                </div>
              </div>
            ) : (
              <div className="chips">
                {(Object.keys(WEIGHT_LABELS) as (keyof Weights)[]).map((k) => (
                  <span key={k} className="chip">{WEIGHT_LABELS[k]} · <strong className="num">{Math.round(norm[k] * 100)} %</strong></span>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="stack" style={{ position: "sticky", top: 84 }}>
          <Card title="Prêt à analyser ?">
            <div className="stack">
              <ul className="checklist">
                {checklist.map((c) => (
                  <li key={c.label} className={c.done ? "done" : ""}>
                    <Icon name={c.done ? "checkCircle" : "partial"} size={18} /> {c.label}
                  </li>
                ))}
              </ul>
              <Button type="submit" size="lg" block icon="activity" loading={loading}>
                {loading ? "Analyse en cours…" : "Lancer l'analyse"}
              </Button>
              <p className="subtle">Extraction, vectorisation et score : objectif moins de 5 secondes. Les recommandations se génèrent ensuite sur la page du résultat.</p>
            </div>
          </Card>
          <Card title="Le pipeline">
            <ol className="list small muted">
              <li><strong style={{ color: "var(--text)" }}>Extraire</strong> : nettoyage, sections, entités (NER).</li>
              <li><strong style={{ color: "var(--text)" }}>Évaluer</strong> : embeddings MiniLM, cosinus, score sur 100.</li>
              <li><strong style={{ color: "var(--text)" }}>Guider</strong> : synthèse et plan d'action (LLM).</li>
            </ol>
          </Card>
        </div>
      </form>
    </>
  );
}
