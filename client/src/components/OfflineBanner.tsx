import { useConnectivity } from "../connectivity";

// Alerta persistente (no dismissable): es información de estado, no una
// notificación efímera. Si se pudiera cerrar y después el usuario ve un peso
// desactualizado sin saber por qué, el banner no cumplió su función de
// guardavidas. Se va sola cuando vuelve la conexión; "Reintentar" es la
// válvula de escape para no sentirse impotente mientras tanto.
export function OfflineBanner() {
  const { status, recheck } = useConnectivity();
  if (status !== "offline") return null;

  return (
    <div className="offline-banner" role="status" aria-live="polite">
      <span className="offline-banner-dot" aria-hidden="true" />
      <span className="offline-banner-text">
        Trabajando en modo offline — mostrando tu rutina guardada
      </span>
      <button type="button" className="offline-banner-retry" onClick={recheck}>
        Reintentar
      </button>
    </div>
  );
}
