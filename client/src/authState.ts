// Recuerda si el server confirmó alguna vez una sesión válida, para poder
// renderizar la app offline sin depender de un round-trip a /api/auth/status.
//
// Seguridad: esto NO es un bypass de auth. El flag solo decide qué se
// RENDERIZA en el cliente. Todo dato real sigue viniendo del server (que
// exige la cookie) o del cache del service worker, que solo puede contener
// respuestas 200 que el server ya autorizó para esta misma sesión. Un
// atacante con el teléfono desbloqueado ya tiene acceso a esos caches igual;
// el flag no agrega superficie de ataque.

const KEY = "mi-coach:auth-ok";
// Ventana de gracia: si el último "estoy autenticado" confirmado es más viejo
// que esto, no confiamos en él ni offline. Alineado con la duración de la
// cookie de sesión del server (30 días), pero conservador.
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function setAuthedFlag(ok: boolean): void {
  try {
    if (ok) localStorage.setItem(KEY, String(Date.now()));
    else localStorage.removeItem(KEY);
  } catch {
    // Safari en modo privado tira excepción al escribir en localStorage.
    // Degradamos silenciosamente: hasRecentAuth() siempre dará false.
  }
}

// ¿Hay evidencia reciente de una sesión válida? Solo se usa para decidir el
// render optimista cuando no hay red — nunca reemplaza la verificación real.
export function hasRecentAuth(): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < MAX_AGE_MS;
  } catch {
    return false;
  }
}
