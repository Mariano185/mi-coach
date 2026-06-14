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

// Bootstrap: si no hay hash en DB pero hay AUTH_PASSWORD en env, hashearlo.
// (Single-user: una sola fuente de verdad — el hash en DB. El env var es solo
//  el "seed" para la primera corrida.)
export function bootstrapAuth(): void {
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
