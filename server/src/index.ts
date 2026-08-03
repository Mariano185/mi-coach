import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { fileURLToPath } from "node:url";
import { dirname, resolve, sep } from "node:path";
import { existsSync } from "node:fs";
import { initDb } from "./db.js";
import { authRouter, bootstrapAuth, requireAuth } from "./auth.js";
import { exercisesRouter } from "./routes/exercises.js";
import { bodyweightRouter } from "./routes/bodyweight.js";
import { programRouter } from "./routes/program.js";
import { historyRouter } from "./routes/history.js";
import { mesociclosRouter } from "./routes/mesociclos.js";
import { statsRouter } from "./routes/stats.js";
import { coachRouter } from "./routes/coach.js";
import { tracRouter } from "./routes/trac.js";
import { catalogoRouter } from "./routes/catalogo.js";

const PORT = Number(process.env.PORT) || 3001;

initDb();
bootstrapAuth();

const app = express();
// CORS: refleja el origin (dev=Vite en :5173, prod=mismo server). credentials:true para cookies.
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// Healthcheck público (antes del guard) para monitoreo sin cookie.
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Auth: /api/auth/* es público; el resto de /api/* requiere cookie válida
// (o el header X-Coach-Key del coach).
app.use("/api/auth", authRouter);
app.use("/api", requireAuth);

app.use("/api/exercises", exercisesRouter);
app.use("/api/bodyweight", bodyweightRouter);
app.use("/api/program", programRouter);
app.use("/api/history", historyRouter);
app.use("/api/mesociclos", mesociclosRouter);
app.use("/api/stats", statsRouter);
app.use("/api/coach", coachRouter);
app.use("/api/trac", tracRouter);
app.use("/api", catalogoRouter);

// En producción, servir el frontend buildeado (client/dist) desde el mismo proceso.
// Así no hace falta vite ni nginx: un solo server en :3001 sirve API + SPA.
const __dirname = dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = resolve(__dirname, "..", "..", "client", "dist");
if (existsSync(CLIENT_DIST)) {
  // Assets del service worker: nunca cachear por HTTP. Si el browser sirve un
  // sw.js viejo desde su cache, las actualizaciones del PWA nunca llegan.
  const SW_ASSETS = ["/sw.js", "/registerSW.js", "/manifest.json"];
  app.get(SW_ASSETS, (_req, res, next) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Service-Worker-Allowed", "/");
    next();
  });

  app.use(
    express.static(CLIENT_DIST, {
      setHeaders(res, filePath) {
        // Assets con hash en el nombre (dist/assets/*) son inmutables.
        if (filePath.includes(`${sep}assets${sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    })
  );

  // Guarda: si el build de client quedó a medias y sw.js no existe en dist,
  // devolver 404 real en vez de dejar que el catch-all sirva index.html con
  // MIME text/html — eso rompe el registro del SW de forma confusa.
  app.get(["/sw.js", "/registerSW.js", /^\/workbox-.*\.js$/], (_req, res) => {
    res.status(404).type("application/javascript").send("// not built");
  });

  // Fallback SPA: cualquier ruta no-API devuelve index.html.
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(resolve(CLIENT_DIST, "index.html"));
  });
  console.log(`[server] sirviendo frontend desde ${CLIENT_DIST}`);
}

// Handler de errores: respuesta JSON clara ante excepciones inesperadas.
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message || "error interno" });
});

app.listen(PORT, () => {
  console.log(`[server] escuchando en http://localhost:${PORT}`);
});
