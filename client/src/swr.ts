// Configuración central de SWR. El fetcher reutiliza `req()` de la capa de API,
// así se preserva el manejo de auth (cookie + redirect a login en 401).
//
// Convención de keys: la URL del endpoint GET (string). Es la misma que usa
// `req()`, así que el fetcher es un passthrough tipado. Para revalidar tras una
// mutación, llamá `mutate(key)` con la misma URL.
import type { SWRConfiguration } from "swr";
import { req } from "./api";

// Fetcher genérico: la key ES la URL. SWR cachea por key.
export function swrFetcher<T>(url: string): Promise<T> {
  return req<T>(url);
}

// Keys de los endpoints del programa (un solo lugar para no tipear strings sueltos).
export const swrKeys = {
  programWeeks: () => "/api/program/weeks",
  programWeek: (id: number) => `/api/program/weeks/${id}`,
  programDay: (id: number) => `/api/program/days/${id}`,
  programExercise: (id: number) => `/api/program/exercises/${id}`,
  stats: () => "/api/stats",
  sessions: () => "/api/sessions",
  exercises: () => "/api/exercises",
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
};
