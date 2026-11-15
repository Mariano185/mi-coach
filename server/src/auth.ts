import { Router, type Request, type Response, type NextFunction } from "express";
import bcrypt from "bcrypt";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getSetting, setSetting } from "./db.js";

// Auth single-user: hash bcrypt en settings["auth_password_hash"], session cookie
// firmada con HMAC contra un secret en settings["auth_session_secret"].

const SESSION_COOKIE = "mi_coach_session";
const SESSION_DAYS = 30;
const SESSION_MAX_AGE_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 12;

const PASSWORD_KEY = "auth_password_hash";
const SECRET_KEY = "auth_session_secret";
const COACH_KEY = "coach_api_key";
const COACH_HEADER = "x-coach-key";
const DEVICE_KEY = "device_api_key";
const DEVICE_HEADER = "x-device-key";

// Lo único que la clave del dispositivo (el atajo de iOS) puede hacer: cargar Pasos
// diarios. Cualquier otro método o ruta con esa clave cae al chequeo de cookie → 401.
const RUTA_DISPOSITIVO = { metodo: "PUT", ruta: "/api/pasos" } as const;

// Bootstrap: si no hay hash en DB pero hay AUTH_PASSWORD en env, hashearlo.
// (Single-user: una sola fuente de verdad — el hash en DB. El env var es solo
//  el "seed" para la primera corrida.)
export function bootstrapAuth(): void {
  // Asegurar las claves desde el arranque (cada una se imprime una vez si se genera).
  getCoachKey();
  getDeviceKey();
  if (getSetting(PASSWORD_KEY)) return;
  const envPwd = process.env.AUTH_PASSWORD;
  if (!envPwd) {
    console.warn(
      "[auth] AUTH_PASSWORD no seteado y no hay hash en DB. " +
        "Nadie puede entrar hasta que lo configures (setear env var y reiniciar)."
    );
    return;
  }
  const hash = bcrypt.hashSync(envPwd, BCRYPT_ROUNDS);
  setSetting(PASSWORD_KEY, hash);
  console.log("[auth] password inicial hasheado desde AUTH_PASSWORD");
}

function getSecret(): string {
  let s = getSetting(SECRET_KEY);
  if (!s) {
    s = randomBytes(32).toString("hex");
    setSetting(SECRET_KEY, s);
  }
  return s;
}

// API key del coach: secret estable en settings, auto-generado en el primer
// arranque. El coach (caja negra) lo manda en el header X-Coach-Key para leer/
// escribir sin login de browser. Se imprime una vez al generarlo.
export function getCoachKey(): string {
  let k = getSetting(COACH_KEY);
  if (!k) {
    k = randomBytes(24).toString("hex");
    setSetting(COACH_KEY, k);
    console.log(`[auth] coach_api_key generado: ${k}`);
  }
  return k;
}

// Clave del dispositivo: la usa el atajo de iOS que manda los Pasos diarios (header
// X-Device-Key). Mismo ciclo de vida que la del coach, pero solo autoriza
// RUTA_DISPOSITIVO: si se filtra desde el teléfono, no da acceso al resto de los datos.
export function getDeviceKey(): string {
  let k = getSetting(DEVICE_KEY);
  if (!k) {
    k = randomBytes(24).toString("hex");
    setSetting(DEVICE_KEY, k);
    console.log(`[auth] device_api_key generado: ${k}`);
  }
  return k;
}

// Compara un header contra la clave esperada en tiempo constante.
function claveCoincide(header: unknown, expected: string): boolean {
  if (typeof header !== "string" || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function esRutaDispositivo(req: Request): boolean {
  // originalUrl (no req.path): no depende de dónde esté montado el guard.
  const ruta = req.originalUrl.split("?")[0].replace(/\/+$/, "");
  return req.method === RUTA_DISPOSITIVO.metodo && ruta === RUTA_DISPOSITIVO.ruta;
}

// Token = sessionId + "." + HMAC(secret, sessionId).
// Stateless: no guardamos nada en DB. La firma es lo que valida el token.
function makeToken(sessionId: string): string {
  const sig = createHmac("sha256", getSecret()).update(sessionId).digest("hex");
  return `${sessionId}.${sig}`;
}

function verifyToken(token: string): string | null {
  const idx = token.indexOf(".");
  if (idx < 0) return null;
  const sessionId = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = createHmac("sha256", getSecret()).update(sessionId).digest("hex");
  if (sig.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))) return null;
  } catch {
    return null;
  }
  return sessionId;
}

export function isAuthConfigured(): boolean {
  return getSetting(PASSWORD_KEY) !== null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // Vía coach (caja negra): header X-Coach-Key. Bypassa el login de browser.
  if (claveCoincide(req.headers[COACH_HEADER], getCoachKey())) {
    next();
    return;
  }
  // Vía atajo de iOS: header X-Device-Key, solo para cargar Pasos diarios.
  if (esRutaDispositivo(req) && claveCoincide(req.headers[DEVICE_HEADER], getDeviceKey())) {
    next();
    return;
  }
  // Vía browser: cookie de sesión firmada.
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) {
    res.status(401).json({ error: "no autenticado" });
    return;
  }
  const sessionId = verifyToken(token);
  if (!sessionId) {
    res.status(401).json({ error: "sesión inválida" });
    return;
  }
  next();
}

export const authRouter = Router();

authRouter.post("/login", (req, res) => {
  const { password } = (req.body ?? {}) as { password?: unknown };
  if (typeof password !== "string" || !password) {
    res.status(400).json({ error: "password requerido" });
    return;
  }
  const hash = getSetting(PASSWORD_KEY);
  if (!hash) {
    res.status(503).json({ error: "auth no configurado en el server" });
    return;
  }
  if (!bcrypt.compareSync(password, hash)) {
    res.status(401).json({ error: "password incorrecto" });
    return;
  }
  const sessionId = randomBytes(32).toString("hex");
  const token = makeToken(sessionId);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // Tailscale Funnel termina TLS, así que detrás de Funnel la request llega
    // como HTTPS y podemos marcar secure:true.
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE_MS,
    path: "/",
  });
  res.json({ ok: true });
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json({ ok: true });
});

authRouter.get("/status", (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  const authenticated = !!(token && verifyToken(token));
  res.json({
    authenticated,
    password_configured: isAuthConfigured(),
  });
});
