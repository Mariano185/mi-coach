import Database from "better-sqlite3";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { vi } from "vitest";

// DB en memoria compartida por todos los tests del mismo archivo.
export function createTestDb() {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE,
      categoria TEXT NOT NULL,
      es_basico INTEGER NOT NULL DEFAULT 0,
      patron_id INTEGER REFERENCES patrones(id),
      ejercicio_padre_id INTEGER REFERENCES exercises(id),
      tipo_variante TEXT,
      transferencia REAL,
      proposito TEXT,
      implemento TEXT,
      angulo_grados INTEGER,
      agarre TEXT,
      postura TEXT,
      unilateral INTEGER,
      mecanica TEXT,
      fuerza TEXT,
      sesgo_longitud TEXT,
      perfil_resistencia TEXT,
      cadena TEXT,
      carga_axial INTEGER,
      costo_fatiga INTEGER,
      demanda_estabilidad INTEGER,
      demanda_tecnica INTEGER,
      rastrea_e1rm INTEGER,
      es_competitivo INTEGER,
      notas_tecnicas TEXT,
      contraindicaciones TEXT,
      cues TEXT
    );
    CREATE TABLE IF NOT EXISTS musculos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE,
      nombre_en TEXT,
      grupo TEXT NOT NULL,
      region TEXT,
      biarticular INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS patrones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE,
      plano TEXT,
      descripcion TEXT
    );
    CREATE TABLE IF NOT EXISTS ejercicio_musculos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
      musculo_id INTEGER NOT NULL REFERENCES musculos(id) ON DELETE CASCADE,
      rol TEXT NOT NULL,
      orden INTEGER NOT NULL,
      fraccion_volumen REAL NOT NULL DEFAULT 1.0,
      UNIQUE (exercise_id, musculo_id)
    );
    CREATE TABLE IF NOT EXISTS bodyweight (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT NOT NULL,
      peso_kg REAL NOT NULL,
      kcal_objetivo INTEGER,
      proteina_g INTEGER,
      hambre INTEGER,
      digestion TEXT,
      notas TEXT
    );
    CREATE TABLE IF NOT EXISTS mesociclos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      objetivo TEXT,
      notas TEXT,
      fecha_inicio TEXT,
      fecha_fin TEXT,
      orden INTEGER NOT NULL DEFAULT 0,
      fecha_creada TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS program_weeks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      semana INTEGER NOT NULL,
      nombre TEXT,
      bloque TEXT,
      notas TEXT,
      fecha_creada TEXT NOT NULL,
      activa INTEGER NOT NULL DEFAULT 1,
      mesociclo_id INTEGER REFERENCES mesociclos(id) ON DELETE SET NULL,
      UNIQUE (mesociclo_id, semana)
    );
    CREATE TABLE IF NOT EXISTS program_days (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_id INTEGER NOT NULL REFERENCES program_weeks(id) ON DELETE CASCADE,
      dia INTEGER NOT NULL,
      tipo TEXT,
      titulo TEXT,
      warmup TEXT,
      notas TEXT,
      notas_atleta TEXT,
      fecha TEXT,
      hora_inicio TEXT,
      hora_fin TEXT,
      orden INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS program_exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day_id INTEGER NOT NULL REFERENCES program_days(id) ON DELETE CASCADE,
      exercise_id INTEGER REFERENCES exercises(id),
      nombre_libre TEXT,
      seccion TEXT NOT NULL DEFAULT 'accesorio',
      reps_text TEXT,
      carga_text TEXT,
      rpe_text TEXT,
      notas TEXT,
      orden INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS program_sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      program_exercise_id INTEGER NOT NULL REFERENCES program_exercises(id) ON DELETE CASCADE,
      n_serie INTEGER NOT NULL,
      target_reps INTEGER,
      target_rpe REAL,
      target_peso REAL,
      real_peso REAL,
      real_reps INTEGER,
      real_rpe REAL,
      hecha INTEGER NOT NULL DEFAULT 0,
      notas TEXT
    );
    CREATE TABLE IF NOT EXISTS settings (
      clave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS trac (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT UNIQUE NOT NULL,
      fatiga_pierna INTEGER CHECK (fatiga_pierna IS NULL OR fatiga_pierna BETWEEN 1 AND 5),
      fatiga_empuje INTEGER CHECK (fatiga_empuje IS NULL OR fatiga_empuje BETWEEN 1 AND 5),
      fatiga_traccion INTEGER CHECK (fatiga_traccion IS NULL OR fatiga_traccion BETWEEN 1 AND 5),
      descanso_alimentacion INTEGER CHECK (descanso_alimentacion IS NULL OR descanso_alimentacion BETWEEN 1 AND 5),
      recuperacion INTEGER CHECK (recuperacion IS NULL OR recuperacion BETWEEN 1 AND 5),
      motivacion INTEGER CHECK (motivacion IS NULL OR motivacion BETWEEN 1 AND 5),
      tecnica INTEGER CHECK (tecnica IS NULL OR tecnica BETWEEN 1 AND 5),
      creado_en TEXT NOT NULL DEFAULT (datetime('now')),
      actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE VIEW IF NOT EXISTS v_program_sets_e1rm AS
      SELECT ps.*,
        CASE WHEN ps.real_peso IS NOT NULL AND ps.real_reps IS NOT NULL
             THEN ROUND(ps.real_peso * (1 + ps.real_reps / 30.0), 1) END AS e1rm,
        CASE WHEN ps.real_peso IS NOT NULL AND ps.real_reps IS NOT NULL
             THEN ROUND(ps.real_peso * ps.real_reps, 1) END AS tonelaje,
        CASE WHEN ps.real_rpe IS NOT NULL
             THEN MAX(0, ROUND(10 - ps.real_rpe)) END AS rir
      FROM program_sets ps;
    CREATE VIEW IF NOT EXISTS v_volumen_por_musculo AS
      SELECT
        strftime('%Y-%W', pd.fecha) AS semana,
        m.id AS musculo_id,
        m.nombre AS musculo,
        m.grupo,
        ROUND(SUM(em.fraccion_volumen), 2) AS series
      FROM program_sets ps
      JOIN program_exercises pe ON pe.id = ps.program_exercise_id
      JOIN program_days pd ON pd.id = pe.day_id
      JOIN ejercicio_musculos em ON em.exercise_id = pe.exercise_id
      JOIN musculos m ON m.id = em.musculo_id
      WHERE ps.hecha = 1 AND pd.fecha IS NOT NULL
        AND em.fraccion_volumen > 0
      GROUP BY semana, m.id
      ORDER BY semana, m.grupo, m.nombre;
  `);

  // Ejercicios básicos mínimos para los tests
  db.prepare("INSERT INTO exercises (nombre, categoria, es_basico) VALUES (?, ?, ?)").run(
    "Mid/High Bar Back Squat", "Básico", 1
  );
  db.prepare("INSERT INTO exercises (nombre, categoria, es_basico) VALUES (?, ?, ?)").run(
    "Flat Bench Press (barra)", "Básico", 1
  );
  db.prepare("INSERT INTO exercises (nombre, categoria, es_basico) VALUES (?, ?, ?)").run(
    "Conventional Deadlift", "Básico", 1
  );

  // Auth settings mínimos para pasar requireAuth via X-Coach-Key
  db.prepare("INSERT INTO settings (clave, valor) VALUES (?, ?)").run(
    "coach_api_key", "test-coach-key"
  );
  db.prepare("INSERT INTO settings (clave, valor) VALUES (?, ?)").run(
    "auth_session_secret", "test-secret-32-bytes-long-enough!!"
  );

  return db;
}

export type TestDb = ReturnType<typeof createTestDb>;

// Monta la app Express con la DB inyectada. Llama a esto DESPUÉS de vi.mock("../db.js").
export async function createTestApp(db: TestDb) {
  // Importar los routers después de que vi.mock haya reemplazado db.
  const { programRouter } = await import("../routes/program.js");
  const { historyRouter } = await import("../routes/history.js");
  const { statsRouter } = await import("../routes/stats.js");
  const { coachRouter } = await import("../routes/coach.js");
  const { exercisesRouter } = await import("../routes/exercises.js");
  const { tracRouter } = await import("../routes/trac.js");
  const { mesociclosRouter } = await import("../routes/mesociclos.js");
  const { catalogoRouter } = await import("../routes/catalogo.js");

  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  // Auth simplificado para tests: acepta el header X-Coach-Key contra la DB de test.
  app.use("/api", (req, res, next) => {
    const key = req.headers["x-coach-key"];
    const stored = (db.prepare("SELECT valor FROM settings WHERE clave = 'coach_api_key'").get() as { valor: string } | undefined)?.valor;
    if (key === stored) return next();
    res.status(401).json({ error: "no autenticado" });
  });

  app.use("/api/program", programRouter);
  app.use("/api/history", historyRouter);
  app.use("/api/stats", statsRouter);
  app.use("/api/coach", coachRouter);
  app.use("/api/exercises", exercisesRouter);
  app.use("/api/trac", tracRouter);
  app.use("/api/mesociclos", mesociclosRouter);
  app.use("/api", catalogoRouter);

  return app;
}
