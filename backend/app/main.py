"""API FastAPI (BNF1) : contrat typé entre le frontend React et la logique NLP.

Lancement :  uvicorn backend.app.main:app --reload
Documentation interactive : http://localhost:8000/docs
Toutes les routes sont préfixées par /api ; les routes de données exigent un jeton (Bearer).
"""
from __future__ import annotations

import json
import logging
import os
from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, FastAPI, File, Form, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import ValidationError

from . import db, services
from .config import settings
from .extraction.parser import EmptyDocumentError, UnsupportedFormatError, extract_text
from .extraction.skills_extractor import get_matcher
from .matching.embeddings import get_backend
from .report import build_html_report
from .schemas import (
    AnalysisRecord, AnalysisSummary, CompareRequest, CompareResponse, DashboardStats, DictionaryEntry,
    ExtractRequest, ExtractResponse, HealthOut, PasswordChange, Recommendations, ScoringWeights,
    TokenOut, UserCreate, UserLogin, UserOut, UserUpdate,
)
from .security import InvalidTokenError, decode_access_token

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    # Chargement des modèles au démarrage : la première analyse reste rapide (BNF3).
    get_matcher()
    get_backend().similarity(["warm-up"], ["warm-up"])
    yield


app = FastAPI(
    title="Analyseur Intelligent de CV et d'Offre d'Emploi",
    description="Extraire -> Évaluer -> Guider (EMSI 5AISDR G8)",
    version="0.2.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api = APIRouter(prefix="/api")
bearer = HTTPBearer(auto_error=False)


def current_user_id(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> int:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Connexion requise")
    try:
        user_id = decode_access_token(credentials.credentials)
        services.get_user(user_id)
        return user_id
    except (InvalidTokenError, services.AuthError) as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(exc)) from exc


def _not_found(exc: Exception) -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, str(exc))


async def _read_upload(upload: UploadFile) -> str:
    content = await upload.read()
    if len(content) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"Fichier trop volumineux (max {settings.max_upload_mb} Mo)")
    try:
        return extract_text(upload.filename or "", content)
    except (UnsupportedFormatError, EmptyDocumentError) as exc:
        raise HTTPException(400, str(exc)) from exc


# ---------------------------------------------------------------------------
# Santé
# ---------------------------------------------------------------------------
@api.get("/health", response_model=HealthOut)
def health() -> HealthOut:
    return HealthOut(
        status="ok", ner_engine=get_matcher().name, embedding_backend=get_backend().name,
        llm_configured=settings.llm_configured, llm_model=settings.llm_model or None,
    )


# ---------------------------------------------------------------------------
# Authentification
# ---------------------------------------------------------------------------
@api.post("/auth/register", response_model=TokenOut, status_code=201)
def register(data: UserCreate) -> TokenOut:
    try:
        return services.register(data)
    except db.EmailAlreadyUsedError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc


@api.post("/auth/login", response_model=TokenOut)
def login(data: UserLogin) -> TokenOut:
    try:
        return services.login(data)
    except services.AuthError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(exc)) from exc


@api.get("/auth/me", response_model=UserOut)
def me(user_id: int = Depends(current_user_id)) -> UserOut:
    return services.get_user(user_id)


@api.patch("/auth/me", response_model=UserOut)
def update_me(data: UserUpdate, user_id: int = Depends(current_user_id)) -> UserOut:
    return services.update_profile(user_id, data)


@api.post("/auth/password", status_code=204)
def change_password(data: PasswordChange, user_id: int = Depends(current_user_id)) -> None:
    try:
        services.change_password(user_id, data)
    except services.AuthError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc


# ---------------------------------------------------------------------------
# Analyses (Modules 1 + 2) et recommandations (Module 3)
# ---------------------------------------------------------------------------
@api.post("/analyses", response_model=AnalysisRecord, status_code=201)
async def create_analysis(
    cv_file: UploadFile = File(..., description="CV au format PDF, DOCX ou TXT"),
    job_text: str | None = Form(None, description="Texte de l'offre (saisie directe)"),
    job_file: UploadFile | None = File(None, description="Offre importée (PDF, DOCX, TXT)"),
    weights: str | None = Form(None, description='JSON, ex. {"hard_skills":0.5,"experience":0.25,...}'),
    title: str | None = Form(None),
    company: str | None = Form(None),
    user_id: int = Depends(current_user_id),
) -> AnalysisRecord:
    cv_text = await _read_upload(cv_file)
    if job_file is not None and job_file.filename:
        job_content = await _read_upload(job_file)
    elif job_text and len(job_text.strip()) >= 30:
        job_content = job_text
    else:
        raise HTTPException(400, "Fournissez le texte de l'offre (au moins 30 caractères) ou un fichier.")
    try:
        scoring_weights = ScoringWeights(**json.loads(weights)) if weights else ScoringWeights()
    except (json.JSONDecodeError, ValidationError, TypeError) as exc:
        raise HTTPException(422, f"Poids invalides : {exc}") from exc
    return services.run_analysis(user_id, cv_text, job_content, scoring_weights, title, company, cv_file.filename)


@api.get("/analyses", response_model=list[AnalysisSummary])
def list_analyses(user_id: int = Depends(current_user_id)) -> list[AnalysisSummary]:
    return services.list_analyses(user_id)


@api.get("/analyses/{analysis_id}", response_model=AnalysisRecord)
def get_analysis(analysis_id: int, user_id: int = Depends(current_user_id)) -> AnalysisRecord:
    try:
        return services.get_analysis(user_id, analysis_id)
    except services.NotFoundError as exc:
        raise _not_found(exc) from exc


@api.delete("/analyses/{analysis_id}", status_code=204)
def delete_analysis(analysis_id: int, user_id: int = Depends(current_user_id)) -> None:
    try:
        services.delete_analysis(user_id, analysis_id)
    except services.NotFoundError as exc:
        raise _not_found(exc) from exc


@api.post("/analyses/{analysis_id}/recommendations", response_model=Recommendations)
def recommend(analysis_id: int, use_llm: bool = True, user_id: int = Depends(current_user_id)) -> Recommendations:
    try:
        return services.recommend(user_id, analysis_id, use_llm)
    except services.NotFoundError as exc:
        raise _not_found(exc) from exc


@api.get("/analyses/{analysis_id}/report", response_class=HTMLResponse)
def report(analysis_id: int, user_id: int = Depends(current_user_id)) -> HTMLResponse:
    try:
        record = services.get_analysis(user_id, analysis_id)
    except services.NotFoundError as exc:
        raise _not_found(exc) from exc
    html = build_html_report(record.result, record.recommendations)
    return HTMLResponse(html, headers={"Content-Disposition": f'attachment; filename="bilan_{analysis_id}.html"'})


@api.get("/stats", response_model=DashboardStats)
def stats(user_id: int = Depends(current_user_id)) -> DashboardStats:
    return services.dashboard_stats(user_id)


# ---------------------------------------------------------------------------
# Laboratoire NLP (pages de test)
# ---------------------------------------------------------------------------
@api.post("/lab/extract", response_model=ExtractResponse)
def lab_extract(req: ExtractRequest, _: int = Depends(current_user_id)) -> ExtractResponse:
    return services.extract(req)


@api.post("/lab/compare", response_model=CompareResponse)
def lab_compare(req: CompareRequest, _: int = Depends(current_user_id)) -> CompareResponse:
    return services.compare(req)


@api.get("/skills", response_model=list[DictionaryEntry])
def skills(_: int = Depends(current_user_id)) -> list[DictionaryEntry]:
    return services.dictionary()


app.include_router(api)
