// Exemples de démonstration (mêmes textes que data/samples/ côté backend).

export const SAMPLE_CV = `Sara EL AMRANI
Étudiante ingénieure en Data Science - Casablanca

PROFIL
Étudiante en 5ème année du cycle ingénieur, passionnée par l'apprentissage automatique
et le traitement du langage naturel. Curieuse, autonome et rigoureuse.

EXPÉRIENCES PROFESSIONNELLES
Stagiaire Data Scientist - OCP Group
Juillet 2025 - Septembre 2025
• Développement d'un modèle de classification des réclamations clients avec scikit-learn
• Nettoyage et analyse de données avec Pandas et NumPy
• Création de tableaux de bord avec Power BI pour l'équipe métier

Stagiaire Développeuse Python - Startup FinTech
02/2024 - 05/2024
• Développement d'une API REST avec Flask et PostgreSQL
• Mise en place de tests unitaires avec pytest et gestion du code avec Git

FORMATION
Cycle ingénieur - Intelligence Artificielle et Data Science, EMSI Casablanca
2022 - 2027
Baccalauréat Sciences Mathématiques
2020

PROJETS
- Chatbot de FAQ universitaire avec des embeddings et Sentence-Transformers
- Classification d'images de radiographies avec PyTorch (réseaux de neurones convolutifs)
- Tableau de bord de suivi des ventes avec Streamlit et Plotly

COMPÉTENCES TECHNIQUES
Langages : Python, SQL, Java
Data & IA : Pandas, NumPy, scikit-learn, PyTorch, Matplotlib
Outils : Git, Docker, Linux, Power BI

LANGUES
Français (courant), Anglais (B2), Arabe (langue maternelle)

QUALITÉS
Travail en équipe, communication, esprit d'analyse
`;

export const SAMPLE_JOB = `Offre de stage PFE - Data Scientist NLP (H/F) - Casablanca

Missions :
- Concevoir des modèles de traitement du langage naturel pour analyser les avis clients
- Mettre en place une solution RAG basée sur des LLM pour répondre aux questions des conseillers
- Déployer les modèles sous forme d'API avec FastAPI et Docker
- Suivre les expériences avec MLflow et présenter les résultats aux équipes métier

Profil recherché :
- Étudiant(e) en dernière année d'école d'ingénieur ou Master (Bac+5) en Data Science / IA
- Première expérience de 1 an minimum (stages inclus) en data science
- Maîtrise de Python, SQL et des librairies de Machine Learning
- Bonne connaissance du Deep Learning et des frameworks Hugging Face
- Esprit d'équipe, autonomie et bonne communication
- Anglais professionnel

Serait un plus :
- Connaissance d'un cloud (AWS ou Azure)
- Expérience avec LangChain
`;

export const COMPARE_PRESETS: { label: string; required: string[]; candidate: string[] }[] = [
  { label: "Synonymie : PyTorch ↔ Deep Learning", required: ["Deep Learning", "Apprentissage supervisé"], candidate: ["PyTorch", "sklearn"] },
  { label: "Même famille : AWS ↔ Azure", required: ["AWS", "PostgreSQL", "FastAPI"], candidate: ["Azure", "MySQL", "Flask"] },
  { label: "Cas complet", required: ["Python", "NLP", "RAG", "Docker", "MLflow", "Hugging Face"], candidate: ["python3", "spaCy", "Sentence-Transformers", "Docker", "Git"] },
];
