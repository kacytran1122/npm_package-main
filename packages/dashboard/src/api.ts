/** Thin API client. Keeps the token in memory plus localStorage. */

const BASE = "/api/v1";
const TOKEN_KEY = "selakata.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 401) {
    setToken(null);
    throw new ApiError(401, "Session expired, please sign in again");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, data.error ?? "Request failed");
  }
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

export interface LocaleMeta {
  code: string;
  name: string;
  nativeName: string;
  script: string;
  dir: "ltr" | "rtl";
  registers: string[];
  wordSpaced: boolean;
  countries: string[];
  fallback: string[];
}

export interface Project {
  id: string;
  name: string;
  sourceLocale: string;
  locales: string[];
  apiKey: string;
  members: Array<{ userId: string; role: string; locales: string[] }>;
}

export interface Key {
  id: string;
  name: string;
  description?: string;
  values: Record<string, Record<string, string>>;
  draft: string[];
  regulated: boolean;
  updatedAt: string;
}

export interface LintIssue {
  locale: string;
  key: string;
  rule: string;
  severity: string;
  message: string;
}

export type FacetId = "translated" | "registerDepth" | "lintClean" | "reviewed";

export type ReadinessGrade = "A" | "B" | "C" | "D" | "F";

export interface FacetScore {
  id: FacetId;
  label: string;
  /** 0..1. */
  score: number;
  /** 0..1. */
  weight: number;
  /** Points contributed to the 0..100 composite. */
  contribution: number;
  deficit: number;
  detail: string;
}

export interface LocaleReadiness {
  locale: string;
  /** 0..100. */
  score: number;
  grade: ReadinessGrade;
  facets: FacetScore[];
  /** The facet costing the most points, or null at a perfect score. */
  topDrag: FacetScore | null;
  counts: {
    totalKeys: number;
    translatedKeys: number;
    draftKeys: number;
    registerSlots: { expected: number; filled: number };
    issues: { errors: number; warnings: number };
  };
}

export interface ProjectReadiness {
  score: number;
  grade: ReadinessGrade;
  /** Worst first. */
  locales: LocaleReadiness[];
  blocking: string[];
  releaseThreshold: number;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; user: any }>("POST", "/auth/login", { email, password }),
  register: (email: string, password: string) =>
    request<{ token: string; user: any }>("POST", "/auth/register", { email, password }),
  me: () => request<{ user: any }>("GET", "/auth/me"),

  locales: () => request<LocaleMeta[]>("GET", "/locales"),

  projects: () => request<Project[]>("GET", "/projects"),
  createProject: (name: string, sourceLocale: string, locales: string[]) =>
    request<Project>("POST", "/projects", { name, sourceLocale, locales }),

  keys: (projectId: string) => request<Key[]>("GET", `/projects/${projectId}/keys`),
  createKey: (projectId: string, name: string, regulated = false) =>
    request<Key>("POST", `/projects/${projectId}/keys`, { name, regulated }),
  setValue: (
    projectId: string,
    keyId: string,
    locale: string,
    register: string,
    value: string,
  ) =>
    request<Key>("PUT", `/projects/${projectId}/keys/${keyId}`, {
      locale,
      register,
      value,
    }),

  draft: (projectId: string, keyId: string, locale: string, register: string) =>
    request<{ text: string; issues: LintIssue[] }>(
      "POST",
      `/projects/${projectId}/keys/${keyId}/draft`,
      { locale, register },
    ),

  lint: (projectId: string, register: string) =>
    request<LintIssue[]>("GET", `/projects/${projectId}/lint?register=${register}`),
  readiness: (projectId: string, threshold?: number) =>
    request<ProjectReadiness>(
      "GET",
      `/projects/${projectId}/readiness` +
        (threshold === undefined ? "" : `?threshold=${threshold}`),
    ),

  exportUrl: (projectId: string, format: string, locale: string, register: string) =>
    `${BASE}/projects/${projectId}/export?format=${format}&locale=${locale}&register=${register}`,
};
