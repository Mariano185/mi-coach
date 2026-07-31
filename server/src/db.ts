import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// coach.db: por defecto en la raíz de mi-coach/ (dos niveles arriba de server/src).
// En producción (CT) se sobreescribe con COACH_DB_PATH apuntando al volumen persistente.
const DB_PATH = process.env.COACH_DB_PATH
  ? resolve(process.env.COACH_DB_PATH)
  : resolve(__dirname, "..", "..", "coach.db");

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// --- Migraciones (idempotentes) ---
function migrate(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS exercises (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre    TEXT NOT NULL UNIQUE,
      categoria TEXT NOT NULL,
      es_basico INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha           TEXT NOT NULL,
      tipo            TEXT,              -- etiqueta libre y opcional (ej. "Piernas", "A", null)
      comentarios     TEXT
    );

    CREATE TABLE IF NOT EXISTS sets (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id  INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      exercise_id INTEGER NOT NULL REFERENCES exercises(id),
      n_serie     INTEGER NOT NULL,
      peso_kg     REAL NOT NULL,
      reps        INTEGER NOT NULL,
      rpe         REAL,
      rir         REAL,
      notas       TEXT
    );

    CREATE TABLE IF NOT EXISTS bodyweight (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha         TEXT NOT NULL,
      peso_kg       REAL NOT NULL,
      kcal_objetivo INTEGER,
      proteina_g    INTEGER,
      hambre        INTEGER,
      digestion     TEXT,
      notas         TEXT
    );

    -- Mesociclo: agrupador de semanas (ej. "Acumulación octubre", "Fuerza pre-test").
    -- Cada semana pertenece a un mesociclo (o ninguno); el número de semana se reinicia
    -- por mesociclo, ver UNIQUE(mesociclo_id, semana) en program_weeks.
    CREATE TABLE IF NOT EXISTS mesociclos (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre       TEXT NOT NULL,
      objetivo     TEXT,
      notas        TEXT,
      fecha_inicio TEXT,
      fecha_fin    TEXT,
      orden        INTEGER NOT NULL DEFAULT 0,
      fecha_creada TEXT NOT NULL
    );

    -- === Programa estructurado (semana → día → ejercicio → serie) ===
    -- Reemplaza el .md plano: el coach escribe aquí y el atleta completa los reales.
    CREATE TABLE IF NOT EXISTS program_weeks (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      semana       INTEGER NOT NULL UNIQUE,
      nombre       TEXT,              -- p.ej. "Acumulación (reentrada)"
      bloque       TEXT,              -- p.ej. "Acumulación · Semana 1 de 6-8"
      notas        TEXT,             -- notas generales del coach (markdown corto)
      fecha_creada TEXT NOT NULL,
      activa       INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS program_days (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      week_id     INTEGER NOT NULL REFERENCES program_weeks(id) ON DELETE CASCADE,
      dia         INTEGER NOT NULL,         -- 1..N
      tipo        TEXT,                     -- etiqueta libre y opcional (ej. "Piernas", "A", null)
      titulo      TEXT,                     -- "Squat + Bench"
      warmup      TEXT,
      fecha_plan  TEXT,                     -- YYYY-MM-DD opcional
      session_id  INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
      orden       INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS program_exercises (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      day_id      INTEGER NOT NULL REFERENCES program_days(id) ON DELETE CASCADE,
      exercise_id INTEGER REFERENCES exercises(id),
      nombre_libre TEXT,                    -- si el ejercicio es "a elección" sin id fijo
      seccion     TEXT NOT NULL DEFAULT 'accesorio', -- main | accesorio | core
      reps_text   TEXT,                     -- "6-8", "3×5"
      carga_text  TEXT,                     -- "~75 kg", "—"
      rpe_text    TEXT,                     -- "7", "7-8"
      notas       TEXT,
      orden       INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS program_sets (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      program_exercise_id INTEGER NOT NULL REFERENCES program_exercises(id) ON DELETE CASCADE,
      n_serie             INTEGER NOT NULL,
      -- objetivo (lo pone el coach):
      target_reps         INTEGER,
      target_rpe          REAL,
      target_peso         REAL,           -- carga objetivo de esta serie (kg); NULL = usar carga_text del ejercicio
      -- real (lo completa el atleta):
      real_peso           REAL,
      real_reps           INTEGER,
      real_rpe            REAL,
      hecha               INTEGER NOT NULL DEFAULT 0,
      notas               TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      clave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    );

    -- Trac: tracker diario de bienestar/recuperación, independiente de sessions/program_days
    -- (se puede cargar entrene o no el atleta). Una fila por fecha (upsert por fecha).
    CREATE TABLE IF NOT EXISTS trac (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha                 TEXT UNIQUE NOT NULL,
      fatiga_pierna         INTEGER CHECK (fatiga_pierna IS NULL OR fatiga_pierna BETWEEN 1 AND 5),
      fatiga_empuje         INTEGER CHECK (fatiga_empuje IS NULL OR fatiga_empuje BETWEEN 1 AND 5),
      fatiga_traccion       INTEGER CHECK (fatiga_traccion IS NULL OR fatiga_traccion BETWEEN 1 AND 5),
      descanso_alimentacion INTEGER CHECK (descanso_alimentacion IS NULL OR descanso_alimentacion BETWEEN 1 AND 5),
      recuperacion          INTEGER CHECK (recuperacion IS NULL OR recuperacion BETWEEN 1 AND 5),
      motivacion            INTEGER CHECK (motivacion IS NULL OR motivacion BETWEEN 1 AND 5),
      tecnica               INTEGER CHECK (tecnica IS NULL OR tecnica BETWEEN 1 AND 5),
      creado_en             TEXT NOT NULL DEFAULT (datetime('now')),
      actualizado_en        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- e1RM Epley calculado, nunca hardcodeado. Reusar en /api/stats.
    CREATE VIEW IF NOT EXISTS v_sets_e1rm AS
      SELECT
        s.*,
        ROUND(s.peso_kg * (1 + s.reps / 30.0), 1) AS e1rm
      FROM sets s;

    -- e1RM/tonelaje de las series REALES del programa (solo las completadas).
    CREATE VIEW IF NOT EXISTS v_program_sets_e1rm AS
      SELECT
        ps.*,
        CASE WHEN ps.real_peso IS NOT NULL AND ps.real_reps IS NOT NULL
             THEN ROUND(ps.real_peso * (1 + ps.real_reps / 30.0), 1) END AS e1rm,
        CASE WHEN ps.real_peso IS NOT NULL AND ps.real_reps IS NOT NULL
             THEN ROUND(ps.real_peso * ps.real_reps, 1) END AS tonelaje
      FROM program_sets ps;
  `);

  // Columnas nuevas en tablas ya desplegadas (idempotente: ignorar si ya existen).
  for (const col of [
    "ALTER TABLE program_days ADD COLUMN fecha_real TEXT",
    "ALTER TABLE program_days ADD COLUMN hora_inicio TEXT",
    "ALTER TABLE program_days ADD COLUMN hora_fin TEXT",
    "ALTER TABLE program_days ADD COLUMN notas TEXT",
    "ALTER TABLE program_sets ADD COLUMN target_peso REAL",
    "ALTER TABLE program_weeks ADD COLUMN mesociclo_id INTEGER REFERENCES mesociclos(id) ON DELETE SET NULL",
  ]) {
    try { db.exec(col); } catch { /* columna ya existe */ }
  }

  // tipo A/B → texto libre opcional. SQLite no soporta ALTER COLUMN/DROP CONSTRAINT,
  // así que hay que recrear la tabla para sacar el CHECK viejo. Idempotente: solo corre
  // si el CHECK sigue presente en el DDL guardado.
  dropTipoCheck("sessions");
  dropTipoCheck("program_days");

  // semana única global → única por mesociclo (mesociclo_id, semana). Requiere recrear
  // la tabla porque el UNIQUE viejo está en la definición de columna. Idempotente: solo
  // corre si el UNIQUE global sigue presente en el DDL guardado.
  migrateSemanaUnique();

  // Bienestar en sessions (energia/sueno_horas/motivacion/dolor_molestias) nunca tuvo
  // formulario en la UI — trac lo reemplazó de hecho. Sacar las columnas muertas.
  dropSessionsBienestarColumns();
}

function dropSessionsBienestarColumns(): void {
  const cols = db.prepare("PRAGMA table_info(sessions)").all() as Array<{ name: string }>;
  for (const col of ["energia", "sueno_horas", "motivacion", "dolor_molestias"]) {
    if (cols.some((c) => c.name === col)) {
      db.exec(`ALTER TABLE sessions DROP COLUMN ${col}`);
    }
  }
}

function dropTipoCheck(table: "sessions" | "program_days"): void {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?")
    .get(table) as { sql: string } | undefined;
  if (!row || !/CHECK\s*\(\s*tipo\s+IN/i.test(row.sql)) return; // ya migrado o no existe

  db.pragma("foreign_keys = OFF");
  const tx = db.transaction(() => {
    if (table === "sessions") {
      const cols = db.prepare("PRAGMA table_info(sessions)").all() as Array<{ name: string }>;
      const hasBienestar = cols.some((c) => c.name === "energia");
      db.exec(`
        CREATE TABLE sessions_new (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          fecha           TEXT NOT NULL,
          tipo            TEXT,
          ${hasBienestar ? "energia INTEGER, sueno_horas REAL, motivacion INTEGER, dolor_molestias TEXT," : ""}
          comentarios     TEXT
        );
        INSERT INTO sessions_new SELECT id, fecha, tipo, ${hasBienestar ? "energia, sueno_horas, motivacion, dolor_molestias," : ""} comentarios FROM sessions;
        DROP TABLE sessions;
        ALTER TABLE sessions_new RENAME TO sessions;
      `);
    } else {
      db.exec(`
        CREATE TABLE program_days_new (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          week_id     INTEGER NOT NULL REFERENCES program_weeks(id) ON DELETE CASCADE,
          dia         INTEGER NOT NULL,
          tipo        TEXT,
          titulo      TEXT,
          warmup      TEXT,
          notas       TEXT,
          fecha_plan  TEXT,
          fecha_real  TEXT,
          hora_inicio TEXT,
          hora_fin    TEXT,
          session_id  INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
          orden       INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO program_days_new SELECT id, week_id, dia, tipo, titulo, warmup, notas, fecha_plan, fecha_real, hora_inicio, hora_fin, session_id, orden FROM program_days;
        DROP TABLE program_days;
        ALTER TABLE program_days_new RENAME TO program_days;
      `);
    }
  });
  tx();
  db.pragma("foreign_keys = ON");
}

function migrateSemanaUnique(): void {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='program_weeks'")
    .get() as { sql: string } | undefined;
  // Guard de idempotencia: si ya no tiene UNIQUE en la columna semana, salir.
  if (!row || !/semana\s+INTEGER\s+NOT\s+NULL\s+UNIQUE/i.test(row.sql)) return;

  db.pragma("foreign_keys = OFF");
  const tx = db.transaction(() => {
    db.exec(`
      CREATE TABLE program_weeks_new (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        semana       INTEGER NOT NULL,
        nombre       TEXT,
        bloque       TEXT,
        notas        TEXT,
        fecha_creada TEXT NOT NULL,
        activa       INTEGER NOT NULL DEFAULT 1,
        mesociclo_id INTEGER REFERENCES mesociclos(id) ON DELETE SET NULL,
        UNIQUE (mesociclo_id, semana)
      );
      INSERT INTO program_weeks_new (id, semana, nombre, bloque, notas, fecha_creada, activa, mesociclo_id)
        SELECT id, semana, nombre, bloque, notas, fecha_creada, activa, mesociclo_id FROM program_weeks;
      DROP TABLE program_weeks;
      ALTER TABLE program_weeks_new RENAME TO program_weeks;
    `);
  });
  tx();
  db.pragma("foreign_keys = ON");
}

// --- Exercise Library (sección 7). Los 3 primeros son básicos. ---
const EXERCISE_LIBRARY: Array<[string, string, 0 | 1]> = [
  ["Mid/High Bar Back Squat", "Básico", 1],
  ["Conventional Deadlift", "Básico", 1],
  ["Flat Bench Press (barra)", "Básico", 1],
  ["Incline Bench Press (Smith)", "Smith/Multipower", 0],
  ["Shoulder Press (Smith)", "Smith/Multipower", 0],
  ["Squat (Smith)", "Smith/Multipower", 0],
  ["Incline Bench Press (barra)", "Smith/Multipower", 0],
  ["Flat Dumbbell Bench Press", "Press mancuernas", 0],
  ["Incline Dumbbell Bench Press", "Press mancuernas", 0],
  ["Jalón agarre neutro", "Espalda/Deltoides post.", 0],
  ["Remo en máquina T", "Espalda/Deltoides post.", 0],
  ["Remo con mancuernas", "Espalda/Deltoides post.", 0],
  ["Face Pulls", "Espalda/Deltoides post.", 0],
  ["Peck Deck Invertido", "Espalda/Deltoides post.", 0],
  ["Dominadas", "Espalda/Deltoides post.", 0],
  ["Vuelos laterales con mancuernas", "Hombros", 0],
  ["Press de hombro en Smith", "Hombros", 0],
  ["Peck Deck (Mariposa)", "Pecho accesorio", 0],
  ["Prensa inclinada 45°", "Piernas", 0],
  ["Sillón de cuádriceps (Leg Extension)", "Piernas", 0],
  ["Sillón de isquios (Leg Curl)", "Piernas", 0],
  ["Romanian Deadlift", "Piernas", 0],
  ["Tríceps en polea", "Brazos", 0],
  ["Curl inclinado con mancuernas", "Brazos", 0],
  ["Curl en banco Scott (Preacher)", "Brazos", 0],
  ["Curl alternado con mancuernas", "Brazos", 0],
];

function seedExercises(): void {
  const count = (db.prepare("SELECT COUNT(*) AS n FROM exercises").get() as { n: number }).n;
  if (count > 0) return;
  const insert = db.prepare(
    "INSERT INTO exercises (nombre, categoria, es_basico) VALUES (?, ?, ?)"
  );
  const tx = db.transaction(() => {
    for (const [nombre, categoria, es_basico] of EXERCISE_LIBRARY) {
      insert.run(nombre, categoria, es_basico);
    }
  });
  tx();
}

function seedSettings(): void {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO settings (clave, valor) VALUES (?, ?)"
  );
  // 1RM de partida del atleta (sección 8). Editables.
  insert.run("rm_squat", "97");
  insert.run("rm_bench", "82.5");
  insert.run("rm_deadlift", "160");
}

// Helper: fecha YYYY-MM-DD a N días atrás de hoy.
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function exId(nombre: string): number {
  return (db.prepare("SELECT id FROM exercises WHERE nombre = ?").get(nombre) as { id: number }).id;
}

// === Settings (clave/valor, reusado por auth) ===
export function getSetting(clave: string): string | null {
  const row = db
    .prepare("SELECT valor FROM settings WHERE clave = ?")
    .get(clave) as { valor: string } | undefined;
  return row ? row.valor : null;
}
export function setSetting(clave: string, valor: string): void {
  db.prepare("INSERT OR REPLACE INTO settings (clave, valor) VALUES (?, ?)").run(clave, valor);
}

// --- Seed mínimo: ~2 semanas de sesiones A/B + bodyweight, para que el dashboard no esté vacío. ---
function seedSampleData(): void {
  const count = (db.prepare("SELECT COUNT(*) AS n FROM sessions").get() as { n: number }).n;
  if (count > 0) return;

  const insertSession = db.prepare(
    `INSERT INTO sessions (fecha, tipo, comentarios)
     VALUES (@fecha, @tipo, @comentarios)`
  );
  const insertSet = db.prepare(
    `INSERT INTO sets (session_id, exercise_id, n_serie, peso_kg, reps, rpe, rir, notas)
     VALUES (@session_id, @exercise_id, @n_serie, @peso_kg, @reps, @rpe, @rir, @notas)`
  );
  const insertBw = db.prepare(
    `INSERT INTO bodyweight (fecha, peso_kg, kcal_objetivo, proteina_g, hambre, digestion, notas)
     VALUES (@fecha, @peso_kg, @kcal_objetivo, @proteina_g, @hambre, @digestion, @notas)`
  );

  const squat = exId("Mid/High Bar Back Squat");
  const dead = exId("Conventional Deadlift");
  const bench = exId("Flat Bench Press (barra)");
  const incline = exId("Incline Bench Press (barra)");
  const lateral = exId("Vuelos laterales con mancuernas");
  const row = exId("Remo en máquina T");
  const legext = exId("Sillón de cuádriceps (Leg Extension)");
  const triceps = exId("Tríceps en polea");

  interface SetSeed {
    ex: number;
    peso: number;
    reps: number;
    rpe: number;
    series: number;
  }
  // Sesión A: Squat + Bench pesados + accesorios. Sesión B: Deadlift + Bench + accesorios.
  function makeSetsA(squatKg: number, benchKg: number): SetSeed[] {
    return [
      { ex: squat, peso: squatKg, reps: 5, rpe: 7, series: 3 },
      { ex: bench, peso: benchKg, reps: 5, rpe: 7, series: 3 },
      { ex: incline, peso: benchKg - 25, reps: 10, rpe: 8, series: 3 },
      { ex: legext, peso: 55, reps: 12, rpe: 9, series: 3 },
      { ex: lateral, peso: 10, reps: 15, rpe: 9, series: 3 },
    ];
  }
  function makeSetsB(deadKg: number, benchKg: number): SetSeed[] {
    return [
      { ex: dead, peso: deadKg, reps: 4, rpe: 7.5, series: 2 },
      { ex: bench, peso: benchKg, reps: 6, rpe: 7, series: 3 },
      { ex: row, peso: 60, reps: 10, rpe: 8, series: 3 },
      { ex: triceps, peso: 30, reps: 12, rpe: 9, series: 3 },
      { ex: lateral, peso: 10, reps: 15, rpe: 9, series: 3 },
    ];
  }

  // 4 sesiones repartidas en ~2 semanas con leve progresión.
  const sessions: Array<{
    fecha: string;
    tipo: "A" | "B";
    sets: SetSeed[];
  }> = [
    { fecha: daysAgo(13), tipo: "A", sets: makeSetsA(80, 67.5) },
    { fecha: daysAgo(11), tipo: "B", sets: makeSetsB(130, 70) },
    { fecha: daysAgo(6), tipo: "A", sets: makeSetsA(82.5, 70) },
    { fecha: daysAgo(4), tipo: "B", sets: makeSetsB(132.5, 70) },
  ];

  const tx = db.transaction(() => {
    for (const s of sessions) {
      const res = insertSession.run({
        fecha: s.fecha,
        tipo: s.tipo,
        comentarios: "Sesión de ejemplo (seed).",
      });
      const sessionId = res.lastInsertRowid as number;
      for (const st of s.sets) {
        for (let i = 1; i <= st.series; i++) {
          insertSet.run({
            session_id: sessionId,
            exercise_id: st.ex,
            n_serie: i,
            peso_kg: st.peso,
            reps: st.reps,
            rpe: st.rpe,
            rir: Math.max(0, Math.round(10 - st.rpe)),
            notas: null,
          });
        }
      }
    }

    // Bodyweight: leve tendencia bajista (~72.8 → 72.3) sobre 2 semanas.
    const bwDays = [13, 11, 9, 7, 5, 3, 1];
    const bwVals = [72.8, 72.9, 72.6, 72.5, 72.6, 72.4, 72.3];
    for (let i = 0; i < bwDays.length; i++) {
      insertBw.run({
        fecha: daysAgo(bwDays[i]),
        peso_kg: bwVals[i],
        kcal_objetivo: 2600,
        proteina_g: 160,
        hambre: 5,
        digestion: "ok",
        notas: null,
      });
    }
  });
  tx();
}

export function initDb(): void {
  migrate();
  seedExercises();
  seedSettings();
  console.log(`[db] listo en ${DB_PATH}`);
}
