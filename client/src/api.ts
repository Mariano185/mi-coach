// Cliente fetch tipado. Una función por endpoint. Rutas relativas (proxy de Vite → :3001).
import type {
  Exercise,
  HistoryDay,
  HistoryDayDetail,
  Mesociclo,
  MesocicloConSemanas,
  NewBodyweightInput,
  ProgramDayDetail,
  ProgramExerciseDetail,
  ProgramSet,
  ProgramWeek,
  ProgramWeekDetail,
  Stats,
  TracEntry,
  UpdateProgramSetInput,
  UpdateProgramSetTargetInput,
  UpsertTracInput,
} from "./types";
import { setAuthedFlag } from "./authState";
import { reportConnectivity } from "./connectivity";

// Flag para evitar loops infinitos cuando /api/auth/status devuelve 401.
let redirectingToLogin = false;

function redirectToLogin(): void {
  if (redirectingToLogin) return;
  if (location.pathname === "/login") return;
  redirectingToLogin = true;
  const next = encodeURIComponent(location.pathname + location.search);
  location.href = `/login?next=${next}`;
}

// Error de red: el fetch ni siquiera llegó al server (offline, DNS, server
// caído, túnel roto). NO implica falta de auth — a diferencia de un 401, acá
// el server nunca respondió, así que no sabemos nada sobre la sesión.
export class NetworkError extends Error {
  readonly isNetworkError = true;
  readonly sourceError?: unknown;
  constructor(sourceError?: unknown) {
    super("sin conexión con el servidor");
    this.name = "NetworkError";
    this.sourceError = sourceError;
  }
}

export function isNetworkError(e: unknown): e is NetworkError {
  return e instanceof NetworkError;
}

export async function req<T>(url: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      credentials: "include", // enviar/recibir cookie de sesión
      ...options,
    });
  } catch (e) {
    // No redirigir a login acá: un fallo de red no dice nada sobre la sesión.
    reportConnectivity(false);
    throw new NetworkError(e);
  }

  if (res.status === 401) {
    // El server sí respondió: la sesión venció o no existe. Acá sí es un 401 real.
    setAuthedFlag(false);
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

  getHistory: () => req<HistoryDay[]>("/api/history"),
  getHistoryDay: (dayId: number) => req<HistoryDayDetail>(`/api/history/${dayId}`),

  createBodyweight: (input: NewBodyweightInput) =>
    req<{ id: number }>("/api/bodyweight", { method: "POST", body: JSON.stringify(input) }),

  getStats: () => req<Stats>("/api/stats"),

  // Mesociclos
  getMesociclos: () => req<MesocicloConSemanas[]>("/api/mesociclos"),
  getMesociclo: (id: number) =>
    req<Mesociclo & { semanas: ProgramWeek[] }>(`/api/mesociclos/${id}`),

  // Programa estructurado
  getProgramWeeks: () => req<ProgramWeek[]>("/api/program/weeks"),
  getProgramWeeksByMesociclo: (id: number | null) =>
    req<ProgramWeek[]>(
      id == null ? "/api/program/weeks?mesociclo_id=null" : `/api/program/weeks?mesociclo_id=${id}`
    ),
  getProgramWeek: (id: number) => req<ProgramWeekDetail>(`/api/program/weeks/${id}`),
  getProgramDay: (id: number) => req<ProgramDayDetail>(`/api/program/days/${id}`),
  updateProgramDay: (
    id: number,
    input: {
      titulo?: string | null;
      warmup?: string | null;
      notas?: string | null;
      notas_atleta?: string | null;
      fecha?: string | null;
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
  updateProgramSetTarget: (id: number, input: UpdateProgramSetTargetInput) =>
    req<ProgramSet>(`/api/program/sets/${id}/target`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),

  getTrac: (fecha: string) => req<TracEntry | null>(`/api/trac?fecha=${fecha}`),
  upsertTrac: (input: UpsertTracInput) =>
    req<TracEntry>("/api/trac", { method: "PUT", body: JSON.stringify(input) }),

  // Auth
  login: (password: string) =>
    req<{ ok: true }>("/api/auth/login", { method: "POST", body: JSON.stringify({ password }) }),
  logout: () => req<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  authStatus: () =>
    req<{ authenticated: boolean; password_configured: boolean }>("/api/auth/status"),
};
