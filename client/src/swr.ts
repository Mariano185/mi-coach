// Configuración central de SWR. El fetcher reutiliza `req()` de la capa de API,
// así se preserva el manejo de auth (cookie + redirect a login en 401).
//
// Convención de keys: la URL del endpoint GET (string). Es la misma que usa
// `req()`, así que el fetcher es un passthrough tipado. Para revalidar tras una
// mutación, llamá `mutate(key)` con la misma URL.
import type { SWRConfiguration } from "swr";
import { isNetworkError, req } from "./api";

// Fetcher genérico: la key ES la URL. SWR cachea por key.
export function swrFetcher<T>(url: string): Promise<T> {
  return req<T>(url);
}

// Keys de los endpoints del programa (un solo lugar para no tipear strings sueltos).
export const swrKeys = {
  programWeeks: () => "/api/program/weeks",
  programWeeksByMesociclo: (id: number | null) =>
    id == null ? "/api/program/weeks?mesociclo_id=null" : `/api/program/weeks?mesociclo_id=${id}`,
  programWeek: (id: number) => `/api/program/weeks/${id}`,
  mesociclos: () => "/api/mesociclos",
  mesociclo: (id: number) => `/api/mesociclos/${id}`,
  programDay: (id: number) => `/api/program/days/${id}`,
  programExercise: (id: number) => `/api/program/exercises/${id}`,
  stats: () => "/api/stats",
  history: () => "/api/history",
  historyDay: (dayId: number) => `/api/history/${dayId}`,
  exercises: () => "/api/exercises",
  trac: (fecha: string) => `/api/trac?fecha=${fecha}`,
} as const;

// Config global. `keepPreviousData` evita el parpadeo al navegar: muestra el
// dato anterior mientras revalida la nueva key.
export const swrConfig: SWRConfiguration = {
  fetcher: swrFetcher,
  keepPreviousData: true,
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
  // Dedup de requests idénticas en una ventana corta (navegación rápida).
  dedupingInterval: 2000,
  // Offline, cada request rebota con backoff y llena la consola de ruido sin
  // ganar nada: el service worker ya sirvió el cache o no hay nada que servir.
  shouldRetryOnError: (err) => !isNetworkError(err),
};
