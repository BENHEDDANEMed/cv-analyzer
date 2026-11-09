// Types TypeScript : miroir des schémas Pydantic du backend (backend/app/schemas.py).

export type Role = "candidat" | "recruteur" | "conseiller";
export type SkillType = "hard_skill" | "soft_skill";
export type MatchStatus = "Couvert" | "Partiel" | "Absent";
export type SectionName = "profil" | "experience" | "formation" | "competences" | "projets" | "autre";

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: Role;
  created_at: string;
}

export interface TokenOut {
  access_token: string;
  token_type: "bearer";
  user: User;
}

export interface Skill {
  name: string;
  type: SkillType;
  category: string | null;
  mentions: string[];
  contexts: string[];
  optional: boolean;
}

export interface Degree {
  label: string;
  level: number;
}

export interface ParsedDocument {
  kind: "cv" | "offre";
  clean_text: string;
  sections: Partial<Record<SectionName, string>>;
  hard_skills: Skill[];
  soft_skills: Skill[];
  degrees: Degree[];
  years_experience: number | null;
}

export interface Weights {
  hard_skills: number;
  experience: number;
  formation: number;
  soft_skills: number;
}

export type SubScores = { [K in keyof Weights]: number | null };

export interface SkillMatch {
  required: string;
  type: SkillType;
  optional: boolean;
  status: MatchStatus;
  similarity: number;
  matched_with: string | null;
  reason: string;
}

export interface AnalysisResult {
  global_score: number;
  sub_scores: SubScores;
  weights: Weights;
  gap_analysis: SkillMatch[];
  not_evaluated: string[];
  cv: ParsedDocument;
  job: ParsedDocument;
  embedding_backend: string;
  timings_ms: Record<string, number>;
}

export interface Reformulation {
  avant: string;
  apres: string;
  mots_cles: string[];
}

export interface ActionItem {
  competence: string;
  type: "projet" | "certification" | "formation" | "ressource";
  action: string;
  duree_estimee: string | null;
}

export interface Recommendations {
  synthese: string;
  forces: string[];
  lacunes_prioritaires: string[];
  reformulations: Reformulation[];
  plan_action: ActionItem[];
  source: "llm" | "regles";
}

export interface StatusCounts {
  couvert: number;
  partiel: number;
  absent: number;
}

export interface AnalysisSummary {
  id: number;
  title: string;
  company: string | null;
  cv_filename: string | null;
  global_score: number;
  counts: StatusCounts;
  has_recommendations: boolean;
  created_at: string;
}

export interface AnalysisRecord extends AnalysisSummary {
  result: AnalysisResult;
  recommendations: Recommendations | null;
}

export interface DashboardStats {
  total_analyses: number;
  average_score: number | null;
  best_score: number | null;
  last_score: number | null;
  last_delta: number | null;
  status_totals: StatusCounts;
  score_history: { id: number; title: string; score: number; created_at: string }[];
  top_missing_skills: { name: string; count: number }[];
}

export interface ExtractResponse {
  document: ParsedDocument;
  ner_engine: string;
  duration_ms: number;
}

export interface CompareResponse {
  required: string[];
  candidate: string[];
  matrix: number[][];
  matches: SkillMatch[];
  embedding_backend: string;
  thresholds: { couvert: number; partiel: number };
}

export interface DictionaryEntry {
  name: string;
  type: SkillType;
  category: string | null;
  aliases: string[];
  implies: string[];
}

export interface Health {
  status: string;
  ner_engine: string;
  embedding_backend: string;
  llm_configured: boolean;
  llm_model: string | null;
}
