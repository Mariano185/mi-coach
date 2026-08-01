import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type Status = "online" | "offline" | "checking";

const Ctx = createContext<{ status: Status; recheck: () => void }>({
  status: "online",
  recheck: () => {},
});

export const useConnectivity = () => useContext(Ctx);

// Nivel de módulo: api.ts puede empujar señales de conectividad sin importar
// React. Se conecta al provider de más abajo cuando este monta.
let pushSignal: ((ok: boolean) => void) | null = null;
export function reportConnectivity(ok: boolean): void {
  pushSignal?.(ok);
}

const HEALTH_URL = "/api/health";
const POLL_OK_MS = 45_000; // latido tranquilo cuando todo anda
const POLL_DOWN_MS = 8_000; // reintento rápido cuando está caído
const PROBE_TIMEOUT_MS = 4_000;

async function probe(): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(HEALTH_URL, {
      method: "GET",
      // no-store: nunca desde el cache HTTP ni el service worker. Este es el
      // latido real — si viniera del SW, "server caído" se leería como "ok".
      cache: "no-store",
      signal: ctrl.signal,
      credentials: "include",
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

export function ConnectivityProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>(() => (navigator.onLine ? "checking" : "offline"));
  const timer = useRef<number | null>(null);
  const runRef = useRef<() => void>(() => {});

  const schedule = useCallback((ok: boolean) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = window.setTimeout(() => runRef.current(), ok ? POLL_OK_MS : POLL_DOWN_MS);
  }, []);

  const run = useCallback(async () => {
    // Atajo barato: si el SO ya dice que no hay red, no hace falta el fetch.
    if (!navigator.onLine) {
      setStatus("offline");
      schedule(false);
      return;
    }
    const ok = await probe();
    setStatus(ok ? "online" : "offline");
    schedule(ok);
  }, [schedule]);

  useEffect(() => {
    runRef.current = () => void run();
  }, [run]);

  useEffect(() => {
    pushSignal = (ok: boolean) => {
      if (!ok) {
        // Un fetch de la app falló duro. Confirmamos con un probe inmediato
        // en vez de creerle a ciegas (podría ser un 500 puntual del recurso).
        setStatus((s) => (s === "offline" ? s : "checking"));
        void run();
      }
    };
    void run();

    const onOnline = () => void run();
    const onOffline = () => setStatus("offline");
    const onVisible = () => {
      // iOS suspende timers en background; sin esto, al volver a la app se
      // vería un banner desactualizado por hasta 45s.
      if (document.visibilityState === "visible") void run();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      pushSignal = null;
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <Ctx.Provider value={{ status, recheck: run }}>{children}</Ctx.Provider>;
}
