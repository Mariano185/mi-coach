import { useEffect, useState } from "react";
import { registerSW } from "virtual:pwa-register";

// Botón "Actualizar" en vez de recarga automática: con precaching extensivo
// de HTML, un skipWaiting ciego puede swapear assets bajo una página ya
// cargada. En una app de gimnasio, un reload sorpresivo a mitad de cargar
// series es peor que un cartelito discreto.
export function UpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [update, setUpdate] = useState<(() => Promise<void>) | null>(null);

  useEffect(() => {
    // Escotilla de emergencia: si algo sale mal en producción, se puede
    // desactivar el registro del SW sin rebuild de todo lo demás.
    if (import.meta.env.VITE_PWA_ENABLED === "false") return;
    if (!("serviceWorker" in navigator)) return;

    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        setNeedRefresh(true);
        setUpdate(() => () => updateSW(true));
      },
      onOfflineReady() {
        console.info("[pwa] listo para funcionar offline");
      },
      onRegisteredSW(_url: string, reg: ServiceWorkerRegistration | undefined) {
        if (reg) setInterval(() => void reg.update(), 60 * 60 * 1000);
      },
      onRegisterError(e: unknown) {
        console.error("[pwa] fallo al registrar el service worker", e);
      },
    });

    // En Safari no muestra prompt: se auto-aprueba o deniega según el
    // historial de interacción del sitio. Llamarlo es gratis.
    if (navigator.storage?.persist) void navigator.storage.persist();
  }, []);

  if (!needRefresh) return null;

  return (
    <div className="update-prompt" role="status">
      <span>Hay una versión nueva</span>
      <button type="button" className="btn" onClick={() => void update?.()}>
        Actualizar
      </button>
      <button type="button" className="update-prompt-later" onClick={() => setNeedRefresh(false)}>
        Después
      </button>
    </div>
  );
}
