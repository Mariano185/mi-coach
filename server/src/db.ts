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
      tipo            TEXT NOT NULL CHECK (tipo IN ('A','B')),
      energia         INTEGER,
      sueno_horas     REAL,
      motivacion      INTEGER,
      dolor_molestias TEXT,
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

    CREATE TABLE IF NOT EXISTS programs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      semana       INTEGER NOT NULL,
      fecha_creada TEXT NOT NULL,
      contenido_md TEXT NOT NULL,
      resumen      TEXT
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
      tipo        TEXT CHECK (tipo IN ('A','B')),
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
    `INSERT INTO sessions (fecha, tipo, energia, sueno_horas, motivacion, dolor_molestias, comentarios)
     VALUES (@fecha, @tipo, @energia, @sueno_horas, @motivacion, @dolor_molestias, @comentarios)`
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
    energia: number;
    sueno: number;
    motiv: number;
    sets: SetSeed[];
  }> = [
    { fecha: daysAgo(13), tipo: "A", energia: 7, sueno: 7.5, motiv: 8, sets: makeSetsA(80, 67.5) },
    { fecha: daysAgo(11), tipo: "B", energia: 7, sueno: 7, motiv: 7, sets: makeSetsB(130, 70) },
    { fecha: daysAgo(6), tipo: "A", energia: 8, sueno: 8, motiv: 8, sets: makeSetsA(82.5, 70) },
    { fecha: daysAgo(4), tipo: "B", energia: 6, sueno: 6.5, motiv: 6, sets: makeSetsB(132.5, 70) },
  ];

  const tx = db.transaction(() => {
    for (const s of sessions) {
      const res = insertSession.run({
        fecha: s.fecha,
        tipo: s.tipo,
        energia: s.energia,
        sueno_horas: s.sueno,
        motivacion: s.motiv,
        dolor_molestias: null,
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

// === Migración del .md plano a programa estructurado ===
// One-shot: si hay programs viejos pero ninguna program_weeks, los parsea.

interface ParsedSet {
  n_serie: number;
  target_reps: number | null;
  target_rpe: number | null;
}
interface ParsedExercise {
  exercise_id: number | null;
  nombre_libre: string | null;
  seccion: string;
  reps_text: string;
  carga_text: string;
  rpe_text: string;
  sets: ParsedSet[];
}
interface ParsedDay {
  dia: number;
  tipo: "A" | "B" | null;
  titulo: string;
  warmup: string;
  exercises: ParsedExercise[];
}
interface ParsedWeek {
  semana: number;
  nombre: string;
  bloque: string;
  notas: string;
  days: ParsedDay[];
}

// "3×5" → {series:3, reps:5}; "4×6-8" → {series:4, reps:6}; "3×12-15" → {series:3, reps:12}.
function parseSeriesReps(text: string): { series: number; reps: number | null } {
  const m = text.match(/(\d+)\s*[×x]\s*(\d+)/i);
  if (!m) return { series: 3, reps: null };
  const reps = Number(m[2]); // primer número del rango
  return { series: Number(m[1]), reps: Number.isFinite(reps) ? reps : null };
}

// "7", "7-8", "7,5" → primer número como target_rpe.
function parseRpe(text: string): number | null {
  const m = text.match(/(\d+(?:[.,]\d+)?)/);
  return m ? Number(m[1].replace(",", ".")) : null;
}

// "Main" | "Acc" → seccion canónica. "Core" si el ejercicio es de core/abdominal.
function parseSeccion(bloque: string, nombre: string): string {
  const b = bloque.trim().toLowerCase();
  if (b.startsWith("main")) return "main";
  if (/abdominal|rueda|core|plancha/i.test(nombre)) return "core";
  return "accesorio";
}

function exIdByName(nombre: string): number | null {
  const row = db.prepare("SELECT id FROM exercises WHERE nombre = ?").get(nombre.trim()) as
    | { id: number }
    | undefined;
  return row ? row.id : null;
}

function parseProgramMd(semana: number, md: string): ParsedWeek {
  const lines = md.split(/\r?\n/);
  const week: ParsedWeek = { semana, nombre: "", bloque: "", notas: "", days: [] };

  // Título de la semana: "# SEMANA 1 — Acumulación (reentrada)"
  const titleLine = lines.find((l) => /^#\s+SEMANA/i.test(l));
  if (titleLine) {
    const m = titleLine.match(/—\s*(.+)$/);
    week.nombre = m ? m[1].trim() : "";
  }
  const bloqueLine = lines.find((l) => /\*\*Bloque:\*\*/i.test(l));
  if (bloqueLine) week.bloque = bloqueLine.replace(/.*\*\*Bloque:\*\*/i, "").trim();

  let current: ParsedDay | null = null;
  let inNotas = false;
  const notasBuf: string[] = [];

  for (const line of lines) {
    // Encabezado de día: "## Día 1 (A) — Squat + Bench"
    const dayHead = line.match(/^##\s+Día\s+(\d+)\s*\(([AB])\)\s*—\s*(.+)$/i);
    if (dayHead) {
      if (current) week.days.push(current);
      inNotas = false;
      current = {
        dia: Number(dayHead[1]),
        tipo: dayHead[2].toUpperCase() as "A" | "B",
        titulo: dayHead[3].trim(),
        warmup: "",
        exercises: [],
      };
      continue;
    }
    if (/^##\s+Notas/i.test(line)) {
      if (current) week.days.push(current);
      current = null;
      inNotas = true;
      continue;
    }
    if (inNotas) {
      notasBuf.push(line);
      continue;
    }
    if (!current) continue;

    const warm = line.match(/\*\*Warm-up:\*\*\s*(.+)$/i);
    if (warm) {
      current.warmup = warm[1].trim();
      continue;
    }

    // Filas de tabla: "| Main | Mid/High Bar Back Squat | 3×5 | ~75 kg | 7 |"
    if (line.trim().startsWith("|")) {
      const cells = line.split("|").map((c) => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1);
      if (cells.length < 5) continue;
      const [bloque, nombre, seriesReps, carga, rpe] = cells;
      if (/^bloque$/i.test(bloque) || /^-+$/.test(bloque)) continue; // header/separador
      const { series, reps } = parseSeriesReps(seriesReps);
      const target_rpe = parseRpe(rpe);
      const exId = exIdByName(nombre);
      const sets: ParsedSet[] = [];
      for (let i = 1; i <= series; i++) {
        sets.push({ n_serie: i, target_reps: reps, target_rpe });
      }
      current.exercises.push({
        exercise_id: exId,
        nombre_libre: exId ? null : nombre,
        seccion: parseSeccion(bloque, nombre),
        reps_text: seriesReps,
        carga_text: carga,
        rpe_text: rpe,
        sets,
      });
    }
  }
  if (current) week.days.push(current);
  week.notas = notasBuf.join("\n").trim();
  return week;
}

function insertParsedWeek(w: ParsedWeek, fecha_creada: string): void {
  const insWeek = db.prepare(
    `INSERT INTO program_weeks (semana, nombre, bloque, notas, fecha_creada, activa)
     VALUES (@semana, @nombre, @bloque, @notas, @fecha_creada, 1)`
  );
  const insDay = db.prepare(
    `INSERT INTO program_days (week_id, dia, tipo, titulo, warmup, orden)
     VALUES (@week_id, @dia, @tipo, @titulo, @warmup, @orden)`
  );
  const insEx = db.prepare(
    `INSERT INTO program_exercises (day_id, exercise_id, nombre_libre, seccion, reps_text, carga_text, rpe_text, orden)
     VALUES (@day_id, @exercise_id, @nombre_libre, @seccion, @reps_text, @carga_text, @rpe_text, @orden)`
  );
  const insSet = db.prepare(
    `INSERT INTO program_sets (program_exercise_id, n_serie, target_reps, target_rpe)
     VALUES (@program_exercise_id, @n_serie, @target_reps, @target_rpe)`
  );

  const weekId = insWeek.run({
    semana: w.semana,
    nombre: w.nombre || null,
    bloque: w.bloque || null,
    notas: w.notas || null,
    fecha_creada,
  }).lastInsertRowid as number;

  w.days.forEach((d, di) => {
    const dayId = insDay.run({
      week_id: weekId,
      dia: d.dia,
      tipo: d.tipo,
      titulo: d.titulo || null,
      warmup: d.warmup || null,
      orden: di,
    }).lastInsertRowid as number;

    d.exercises.forEach((ex, ei) => {
      const exRowId = insEx.run({
        day_id: dayId,
        exercise_id: ex.exercise_id,
        nombre_libre: ex.nombre_libre,
        seccion: ex.seccion,
        reps_text: ex.reps_text || null,
        carga_text: ex.carga_text || null,
        rpe_text: ex.rpe_text || null,
        orden: ei,
      }).lastInsertRowid as number;

      for (const s of ex.sets) {
        insSet.run({
          program_exercise_id: exRowId,
          n_serie: s.n_serie,
          target_reps: s.target_reps,
          target_rpe: s.target_rpe,
        });
      }
    });
  });
}

function migrateMarkdownPrograms(): void {
  const hasStructured = (
    db.prepare("SELECT COUNT(*) AS n FROM program_weeks").get() as { n: number }
  ).n;
  if (hasStructured > 0) return; // ya migrado

  const oldPrograms = db
    .prepare("SELECT semana, contenido_md, fecha_creada FROM programs ORDER BY semana")
    .all() as Array<{ semana: number; contenido_md: string; fecha_creada: string }>;
  if (oldPrograms.length === 0) return;

  const tx = db.transaction(() => {
    for (const p of oldPrograms) {
      // Evitar duplicar si una semana ya existe estructurada.
      const exists = db.prepare("SELECT 1 FROM program_weeks WHERE semana = ?").get(p.semana);
      if (exists) continue;
      const parsed = parseProgramMd(p.semana, p.contenido_md);
      if (parsed.days.length > 0) insertParsedWeek(parsed, p.fecha_creada);
    }
  });
  tx();
  console.log(`[db] migrados ${oldPrograms.length} program(s) .md → estructura`);
}

export function initDb(): void {
  migrate();
  seedExercises();
  seedSettings();
  seedSampleData();
  migrateMarkdownPrograms();
  console.log(`[db] listo en ${DB_PATH}`);
}
