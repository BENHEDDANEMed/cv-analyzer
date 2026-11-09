# Analyseur Intelligent de CV et d'Offre d'Emploi

Projet du module IA & Data Science, EMSI, 5AISDR, groupe G8.
Le système compare un CV à une offre d'emploi, calcule un score d'adéquation sur 100 et génère des recommandations.

**Pipeline : Extraire → Évaluer → Guider**

## Architecture

```
frontend/  (React + TypeScript + Vite)      Site web : connexion, tableau de bord, laboratoire NLP
  src/pages/      Auth, Dashboard, NewAnalysis, AnalysisDetail, History,
                  LabExtraction, LabCompare, LabWeights, Dictionary, Profile
  src/components/ Layout (menu), ui (boutons, champs, badges), charts (jauge, courbe), Icon
  src/lib/        api.ts (appels HTTP + jeton), auth.tsx, router.tsx, types.ts
        │  HTTP / JSON  (/api/...)  + jeton JWT « Bearer »
        ▼
backend/app/main.py      API FastAPI (toutes les routes sous /api)
backend/app/services.py  logique applicative (comptes, historique, laboratoire)
backend/app/security.py  mots de passe (PBKDF2) + jetons JWT (HS256)
backend/app/db.py        SQLite : tables users et analyses
backend/app/pipeline.py  Extraire -> Évaluer
├── extraction/   MODULE 1 : parser, cleaner, segmenter, skills_extractor (NER spaCy)
├── matching/     MODULE 2 : embeddings (all-MiniLM-L6-v2), scorer (gap analysis + score)
├── generation/   MODULE 3 : prompts, llm_client, recommender
├── report.py     bilan HTML imprimable
└── schemas.py    schémas Pydantic (contrat d'API)
```

## Les pages du site

| Page | Rôle |
|---|---|
| Connexion / Inscription | Création de compte (candidat, recruteur ou conseiller), connexion sécurisée |
| Tableau de bord | Indicateurs, évolution du score, compétences les plus souvent manquantes, état du système |
| Nouvelle analyse | Dépôt du CV (glisser-déposer), offre en texte ou en fichier, pondération, bouton « Charger l'exemple » |
| Résultat | Jauge du score, sous-scores, matrice des écarts filtrable, recommandations, entités, texte surligné, exports |
| Historique | Toutes les analyses : recherche, tri, suppression |
| Laboratoire → Extraction NER | Tester le Module 1 sur n'importe quel texte (entités surlignées et normalisées) |
| Laboratoire → Comparateur | Tester le Module 2 : deux listes de compétences, statut et matrice de similarité cosinus |
| Laboratoire → Simulateur de poids | Changer les poids et voir l'effet sur le score d'une analyse |
| Dictionnaire | Les ≈ 100 compétences, leurs variantes et leurs relations « implique » |
| Profil | Nom, profil d'utilisation, changement de mot de passe |

## Installation

Prérequis : Python 3.10 ou plus récent, et Node.js 18 ou plus récent.

```bash
# Backend
python -m venv .venv
source .venv/bin/activate          # Windows : .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # puis changer SECRET_KEY

# Frontend
cd frontend
npm install
```

## Lancement (2 terminaux)

```bash
# Terminal 1 : backend (depuis la racine du projet)
uvicorn backend.app.main:app --reload
# documentation de l'API : http://localhost:8000/docs

# Terminal 2 : frontend
cd frontend
npm run dev
# ouvrir http://localhost:5173
```

Vite redirige automatiquement les appels `/api` vers FastAPI (port 8000).
Le premier lancement télécharge le modèle `all-MiniLM-L6-v2` (environ 90 Mo).
La base SQLite est créée automatiquement dans `data/app.db`.

Pour tester vite : créez un compte, puis cliquez sur **Nouvelle analyse → Charger l'exemple → Lancer l'analyse**.

## Configurer le LLM (Module 3)

Sans LLM, l'application fonctionne quand même : les recommandations sont alors générées par des règles.

- **Option A, Ollama en local (gratuit)** : installer https://ollama.com, puis `ollama pull llama3.1:8b`. Les valeurs par défaut du fichier `.env.example` sont déjà prévues pour Ollama.
- **Option B, une API** (Groq, OpenAI…) : modifier `LLM_BASE_URL`, `LLM_API_KEY` et `LLM_MODEL` dans `.env`.

## Tests

```bash
pytest                      # 20 tests : modules NLP, authentification, historique, laboratoire
cd frontend && npm run typecheck   # vérification des types TypeScript
```

Les tests utilisent un backend TF-IDF de secours : ils sont rapides et ne demandent pas de connexion.

## Comment le score est calculé

**Score global** = 0,50 × hard skills + 0,25 × expérience + 0,15 × formation + 0,10 × soft skills.
Les poids sont réglables dans l'interface.

**Gap analysis** : pour chaque compétence demandée par l'offre, le système essaie ces étapes dans l'ordre.
1. La compétence est dans le CV → **Couvert**.
2. Une compétence du CV l'implique (par exemple `PyTorch` → Deep Learning) → **Couvert**.
3. Le CV contient la notion plus générale, ou une compétence de la même famille (par exemple AWS ↔ Azure) → **Partiel**.
4. Sinon, on calcule la similarité cosinus des embeddings : ≥ 0,80 → Couvert, ≥ 0,55 → Partiel, sinon **Absent**.

**Sous-scores** :
- *Hard skills / soft skills* : Couvert = 1, Partiel = 0,5, Absent = 0. Une compétence « souhaitée » compte deux fois moins qu'une compétence obligatoire.
- *Expérience* : 60 % pour les années (CV / exigées) et 40 % pour la similarité entre les missions de l'offre et les expériences du CV.
- *Formation* : 80 % pour le niveau de diplôme (Bac+N) et 20 % pour la proximité du domaine.
- Si l'offre ne dit rien sur un critère (par exemple aucun diplôme demandé), ce critère n'est pas évalué et son poids est redistribué sur les autres.

## Limites connues et pistes d'amélioration

- `all-MiniLM-L6-v2` a été entraîné surtout sur des textes en anglais. Pour des CV en français, il faut comparer avec `paraphrase-multilingual-MiniLM-L12-v2` (il suffit de changer `EMBEDDING_MODEL` dans `.env`).
- Le NER est basé sur des règles et un dictionnaire. Piste : entraîner un modèle NER spaCy sur des CV annotés.
- Les seuils (0,80 / 0,55) sont à calibrer sur un petit jeu de test annoté à la main.
- Les PDF scannés (images) demandent un OCR, qui n'est pas encore intégré.
- Les stages sont comptés dans les années d'expérience.
- Le jeton de connexion est gardé dans le `localStorage` du navigateur : c'est simple pour un projet étudiant. En production, il vaudrait mieux un cookie `HttpOnly`.
