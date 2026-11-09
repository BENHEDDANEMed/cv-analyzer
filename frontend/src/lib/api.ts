// Client HTTP : ajoute le jeton, convertit les erreurs FastAPI en messages lisibles.
import type {
  AnalysisRecord, AnalysisSummary, CompareResponse, DashboardStats, DictionaryEntry, ExtractResponse,
  Health, Recommendations, Role, TokenOut, User,
} from "./types";
import { storage } from "./storage";

const BASE: string = (import.meta as any).env?.VITE_API_URL ?? "/api";
const TOKEN_KEY = "cvmatch_token";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export const tokenStore = {
  get: () => storage.get(TOKEN_KEY),
  set: (t: string) => storage.set(TOKEN_KEY, t),
  clear: () => storage.remove(TOKEN_KEY),
};

function errorMessage(detail: unknown, status: number): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    // Erreurs de validation Pydantic : [{loc, msg}, ...]
    return detail
      .map((d: any) => {
        const field = Array.isArray(d.loc) ? d.loc[d.loc.length - 1] : "";
        return field ? `${field} : ${d.msg}` : d.msg;
      })
      .join(" · ");
  }
  if (status === 0) return "Impossible de joindre l'API. Le backend est-il lancé ?";
  return `Erreur ${status}`;
}

async function request<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = tokenStore.get();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers, body });
  } catch {
    throw new ApiError(errorMessage(null, 0), 0);
  }

  if (res.status === 401 && token) {
    tokenStore.clear();
    window.dispatchEvent(new Event("auth:expired"));
  }
  if (!res.ok) {
    let detail: unknown = null;
    try {
      detail = (await res.json()).detail;
    } catch {
      /* réponse non JSON */
    }
    throw new ApiError(errorMessage(detail, res.status), res.status);
  }
  if (res.status === 204) return undefined as T;
  const type = res.headers.get("content-type") ?? "";
  return (type.includes("application/json") ? res.json() : res.text()) as Promise<T>;
}

export const api = {
  health: () => request<Health>("/health"),

  register: (data: { email: string; full_name: string; password: string; role: Role }) =>
    request<TokenOut>("/auth/register", { method: "POST", json: data }),
  login: (email: string, password: string) =>
    request<TokenOut>("/auth/login", { method: "POST", json: { email, password } }),
  me: () => request<User>("/auth/me"),
  updateMe: (data: { full_name?: string; role?: Role }) => request<User>("/auth/me", { method: "PATCH", json: data }),
  changePassword: (current_password: string, new_password: string) =>
    request<void>("/auth/password", { method: "POST", json: { current_password, new_password } }),

  createAnalysis: (form: FormData) => request<AnalysisRecord>("/analyses", { method: "POST", body: form }),
  listAnalyses: () => request<AnalysisSummary[]>("/analyses"),
  getAnalysis: (id: number) => request<AnalysisRecord>(`/analyses/${id}`),
  deleteAnalysis: (id: number) => request<void>(`/analyses/${id}`, { method: "DELETE" }),
  recommend: (id: number, useLlm: boolean) =>
    request<Recommendations>(`/analyses/${id}/recommendations?use_llm=${useLlm}`, { method: "POST" }),
  report: (id: number) => request<string>(`/analyses/${id}/report`),
  stats: () => request<DashboardStats>("/stats"),

  extract: (text: string, kind: "cv" | "offre") =>
    request<ExtractResponse>("/lab/extract", { method: "POST", json: { text, kind } }),
  compare: (required: string[], candidate: string[]) =>
    request<CompareResponse>("/lab/compare", { method: "POST", json: { required, candidate } }),
  skills: () => request<DictionaryEntry[]>("/skills"),
};

/** Télécharge un contenu texte sous forme de fichier. */
export function downloadFile(content: string, filename: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
