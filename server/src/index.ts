import express from "express";
import cors from "cors";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { initDb } from "./db.js";
import { exercisesRouter } from "./routes/exercises.js";
import { sessionsRouter } from "./routes/sessions.js";
import { setsRouter } from "./routes/sets.js";
import { bodyweightRouter } from "./routes/bodyweight.js";
import { programsRouter } from "./routes/programs.js";
import { programRouter } from "./routes/program.js";
import { statsRouter } from "./routes/stats.js";
import { coachRouter } from "./routes/coach.js";

const PORT = Number(process.env.PORT) || 3001;

initDb();

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/exercises", exercisesRouter);
app.use("/api/sessions", sessionsRouter);
app.use("/api/sets", setsRouter);
app.use("/api/bodyweight", bodyweightRouter);
app.use("/api/programs", programsRouter);
app.use("/api/program", programRouter);
app.use("/api/stats", statsRouter);
app.use("/api/coach", coachRouter);

// En producción, servir el frontend buildeado (client/dist) desde el mismo proceso.
// Así no hace falta vite ni nginx: un solo server en :3001 sirve API + SPA.
const __dirname = dirname(fileURLToPath(import.meta.url));
// dist del server vive en server/dist; el del client en client/dist (../../client/dist).
const CLIENT_DIST = resolve(__dirname, "..", "..", "client", "dist");
if (existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  // Fallback SPA: cualquier ruta no-API devuelve index.html.
  app.get(/^(?!\/api\/).*/, (_req, res) => {
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
