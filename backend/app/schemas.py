"""Schémas Pydantic : le « contrat » JSON entre les modules et entre le backend et le frontend (BNF4)."""
from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, model_validator


# ---------------------------------------------------------------------------
# Module 1 : Extraire
# ---------------------------------------------------------------------------
class SectionName(str, Enum):
    PROFIL = "profil"
    EXPERIENCE = "experience"
    FORMATION = "formation"
    COMPETENCES = "competences"
    PROJETS = "projets"
    AUTRE = "autre"


class SkillType(str, Enum):
    HARD = "hard_skill"
    SOFT = "soft_skill"


class Skill(BaseModel):
    name: str = Field(..., description="Nom normalisé (canonique) de la compétence")
    type: SkillType
    category: str | None = None
    mentions: list[str] = Field(default_factory=list, description="Formes trouvées dans le texte")
    contexts: list[str] = Field(default_factory=list, description="Lignes où la compétence apparaît")
    optional: bool = Field(False, description="Offre : compétence « souhaitée » et non obligatoire")


class Degree(BaseModel):
    label: str
    level: int = Field(..., ge=0, le=8, description="Niveau Bac+N (0 = Bac, 8 = Doctorat)")


class ParsedDocument(BaseModel):
    kind: Literal["cv", "offre"]
    clean_text: str
    sections: dict[SectionName, str]
    hard_skills: list[Skill]
    soft_skills: list[Skill]
    degrees: list[Degree]
    years_experience: float | None = Field(
        None, description="CV : années cumulées ; offre : années exigées"
    )


# ---------------------------------------------------------------------------
# Module 2 : Évaluer
# ---------------------------------------------------------------------------
class ScoringWeights(BaseModel):
    """Pondération du score global (formule 5.1 du cahier des charges)."""

    hard_skills: float = Field(0.50, ge=0, le=1)
    experience: float = Field(0.25, ge=0, le=1)
    formation: float = Field(0.15, ge=0, le=1)
    soft_skills: float = Field(0.10, ge=0, le=1)

    @model_validator(mode="after")
    def _check_sum(self) -> "ScoringWeights":
        total = self.hard_skills + self.experience + self.formation + self.soft_skills
        if abs(total - 1.0) > 0.01:
            raise ValueError(f"La somme des poids doit valoir 1 (actuellement {total:.2f})")
        return self


class MatchStatus(str, Enum):
    COUVERT = "Couvert"
    PARTIEL = "Partiel"
    ABSENT = "Absent"


class SkillMatch(BaseModel):
    required: str = Field(..., description="Compétence exigée par l'offre")
    type: SkillType
    optional: bool = False
    status: MatchStatus
    similarity: float = Field(..., ge=0, le=1)
    matched_with: str | None = Field(None, description="Élément du CV le plus proche")
    reason: str


class SubScores(BaseModel):
    hard_skills: float | None = Field(None, ge=0, le=100)
    experience: float | None = Field(None, ge=0, le=100)
    formation: float | None = Field(None, ge=0, le=100)
    soft_skills: float | None = Field(None, ge=0, le=100)


class AnalysisResult(BaseModel):
    global_score: float = Field(..., ge=0, le=100)
    sub_scores: SubScores
    weights: ScoringWeights
    gap_analysis: list[SkillMatch]
    not_evaluated: list[str] = Field(
        default_factory=list,
        description="Critères absents de l'offre : leur poids est redistribué",
    )
    cv: ParsedDocument
    job: ParsedDocument
    embedding_backend: str
    timings_ms: dict[str, float]


# ---------------------------------------------------------------------------
# Module 3 : Guider
# ---------------------------------------------------------------------------
class Reformulation(BaseModel):
    avant: str = Field(..., description="Phrase actuelle du CV")
    apres: str = Field(..., description="Proposition alignée sur l'offre")
    mots_cles: list[str] = Field(default_factory=list)


class ActionItem(BaseModel):
    competence: str
    type: Literal["projet", "certification", "formation", "ressource"]
    action: str
    duree_estimee: str | None = None


class Recommendations(BaseModel):
    synthese: str
    forces: list[str]
    lacunes_prioritaires: list[str]
    reformulations: list[Reformulation]
    plan_action: list[ActionItem]
    source: Literal["llm", "regles"] = "regles"


class LLMRecommendations(BaseModel):
    """Format strict demandé au LLM (sans le champ « source »)."""

    synthese: str = Field(..., min_length=20)
    forces: list[str] = Field(..., min_length=1)
    lacunes_prioritaires: list[str]
    reformulations: list[Reformulation]
    plan_action: list[ActionItem]


class ReportRequest(BaseModel):
    analysis: AnalysisResult
    recommendations: Recommendations | None = None


# ---------------------------------------------------------------------------
# Authentification et comptes
# ---------------------------------------------------------------------------
Role = Literal["candidat", "recruteur", "conseiller"]


class UserCreate(BaseModel):
    email: str = Field(..., pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=200)
    full_name: str = Field(..., min_length=2, max_length=100)
    password: str = Field(..., min_length=8, max_length=128)
    role: Role = "candidat"


class UserLogin(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: Role
    created_at: str


class TokenOut(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    user: UserOut


class UserUpdate(BaseModel):
    full_name: str | None = Field(None, min_length=2, max_length=100)
    role: Role | None = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=128)


# ---------------------------------------------------------------------------
# Historique
# ---------------------------------------------------------------------------
class StatusCounts(BaseModel):
    couvert: int = 0
    partiel: int = 0
    absent: int = 0


class AnalysisSummary(BaseModel):
    id: int
    title: str
    company: str | None
    cv_filename: str | None
    global_score: float
    counts: StatusCounts
    has_recommendations: bool
    created_at: str


class AnalysisRecord(AnalysisSummary):
    result: AnalysisResult
    recommendations: Recommendations | None = None


class ScorePoint(BaseModel):
    id: int
    title: str
    score: float
    created_at: str


class SkillCount(BaseModel):
    name: str
    count: int


class DashboardStats(BaseModel):
    total_analyses: int
    average_score: float | None
    best_score: float | None
    last_score: float | None
    last_delta: float | None = Field(None, description="Écart entre les deux dernières analyses")
    status_totals: StatusCounts
    score_history: list[ScorePoint]
    top_missing_skills: list[SkillCount]


# ---------------------------------------------------------------------------
# Laboratoire NLP (pages de test)
# ---------------------------------------------------------------------------
class ExtractRequest(BaseModel):
    text: str = Field(..., min_length=10, max_length=50_000)
    kind: Literal["cv", "offre"] = "cv"


class ExtractResponse(BaseModel):
    document: ParsedDocument
    ner_engine: str
    duration_ms: float


class CompareRequest(BaseModel):
    required: list[str] = Field(..., min_length=1, max_length=30, description="Compétences de l'offre")
    candidate: list[str] = Field(..., min_length=1, max_length=30, description="Compétences du CV")


class CompareResponse(BaseModel):
    required: list[str] = Field(..., description="Noms après normalisation")
    candidate: list[str]
    matrix: list[list[float]] = Field(..., description="Similarité cosinus [offre][cv]")
    matches: list[SkillMatch]
    embedding_backend: str
    thresholds: dict[str, float]


class DictionaryEntry(BaseModel):
    name: str
    type: SkillType
    category: str | None
    aliases: list[str]
    implies: list[str]


class HealthOut(BaseModel):
    status: str
    ner_engine: str
    embedding_backend: str
    llm_configured: bool
    llm_model: str | None
