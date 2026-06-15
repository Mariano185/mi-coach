// Cliente fetch tipado. Una función por endpoint. Rutas relativas (proxy de Vite → :3001).
import type {
  Bodyweight,
  CompleteDayInput,
  Exercise,
  NewBodyweightInput,
  NewSessionInput,
  Program,
  ProgramDayDetail,
  ProgramExerciseDetail,
  ProgramSet,
  ProgramSummary,
  ProgramWeek,
  ProgramWeekDetail,
  Session,
  SessionWithSets,
  Stats,
  UpdateProgramSetInput,
} from "./types";

// Flag para evitar loops infinitos cuando /api/auth/status devuelve 401.
let redirectingToLogin = false;

function redirectToLogin(): void {
  if (redirectingToLogin) return;
  if (location.pathname === "/login") return;
  redirectingToLogin = true;
  const next = encodeURIComponent(location.pathname + location.search);
  location.href = `/login?next=${next}`;
}

async function req<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    credentials: "include", // enviar/recibir cookie de sesión
    ...options,
  });
  if (res.status === 401) {
    redirectToLogin();
    throw new Error("no autenticado");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getExercises: () => req<Exercise[]>("/api/exercises"),

  getSessions: () => req<Session[]>("/api/sessions"),
  getSession: (id: number) => req<SessionWithSets>(`/api/sessions/${id}`),
  createSession: (input: NewSessionInput) =>
    req<{ id: number }>("/api/sessions", { method: "POST", body: JSON.stringify(input) }),

  getBodyweight: () => req<Bodyweight[]>("/api/bodyweight"),
  createBodyweight: (input: NewBodyweightInput) =>
    req<{ id: number }>("/api/bodyweight", { method: "POST", body: JSON.stringify(input) }),

  getStats: () => req<Stats>("/api/stats"),

  getPrograms: () => req<ProgramSummary[]>("/api/programs"),
  getProgram: (id: number) => req<Program>(`/api/programs/${id}`),

  // Programa estructurado
  getProgramWeeks: () => req<ProgramWeek[]>("/api/program/weeks"),
  getProgramWeek: (id: number) => req<ProgramWeekDetail>(`/api/program/weeks/${id}`),
  getProgramDay: (id: number) => req<ProgramDayDetail>(`/api/program/days/${id}`),
  updateProgramDay: (
    id: number,
    input: {
      titulo?: string | null;
      warmup?: string | null;
      notas?: string | null;
      fecha_real?: string | null;
      hora_inicio?: string | null;
      hora_fin?: string | null;
    }
  ) =>
    req<ProgramDayDetail>(`/api/program/days/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  getProgramExercise: (id: number) =>
    req<ProgramExerciseDetail>(`/api/program/exercises/${id}`),
  updateProgramSet: (id: number, input: UpdateProgramSetInput) =>
    req<ProgramSet>(`/api/program/sets/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  completeProgramDay: (id: number, input: CompleteDayInput = {}) =>
    req<{ session_id: number; sets: number }>(`/api/program/days/${id}/complete`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  // Auth
  login: (password: string) =>
    req<{ ok: true }>("/api/auth/login", { method: "POST", body: JSON.stringify({ password }) }),
  logout: () => req<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  authStatus: () =>
    req<{ authenticated: boolean; password_configured: boolean }>("/api/auth/status"),
};
