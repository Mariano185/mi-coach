import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { seedEnciclopedia } from "./seed/index.js";

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

    -- Catálogo canónico de músculos (sección "enciclopedia de ejercicios", ver
    -- docs/adr/0001). region permite hipertrofia regional (ej. "porción larga" del
    -- tríceps); biarticular marca los músculos cuya longitud depende de dos
    -- articulaciones, necesario para razonar sobre exercises.sesgo_longitud.
    CREATE TABLE IF NOT EXISTS musculos (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre      TEXT NOT NULL UNIQUE,
      nombre_en   TEXT,
      grupo       TEXT NOT NULL,          -- pecho | espalda | hombro | brazo | pierna | core
      region      TEXT,                   -- subdivisión anatómica opcional
      biarticular INTEGER NOT NULL DEFAULT 0
    );

    -- Catálogo de patrones de movimiento (sentadilla, bisagra de cadera, empuje
    -- horizontal...). Habilita sustituciones ("dame otro empuje horizontal") y
    -- balance empuje/tracción, que con categoria en texto libre eran imposibles.
    CREATE TABLE IF NOT EXISTS patrones (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre      TEXT NOT NULL UNIQUE,
      plano       TEXT,                   -- sagital | frontal | transversal
      descripcion TEXT
    );

    -- Tabla puente ejercicio↔músculo: "todos los músculos de mayor a menor grado"
    -- (ver ADR). Cada VARIANTE lleva su propia grilla, no la hereda del padre: el
    -- press inclinado a 30° y a 60° pueden tener distinto músculo en orden=1.
    CREATE TABLE IF NOT EXISTS ejercicio_musculos (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      exercise_id      INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
      musculo_id       INTEGER NOT NULL REFERENCES musculos(id) ON DELETE CASCADE,
      rol              TEXT NOT NULL,      -- agonista | sinergista | estabilizador
      orden            INTEGER NOT NULL,   -- 1 = mayor contribución (ordinal, no % EMG)
      fraccion_volumen REAL NOT NULL DEFAULT 1.0,  -- 1.0 | 0.5 | 0.25 | 0 — series fraccionadas
      UNIQUE (exercise_id, musculo_id)
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
      fecha       TEXT,                     -- YYYY-MM-DD; se autosetea al completar la primera serie
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

  `);

  // Columnas nuevas en tablas ya desplegadas (idempotente: ignorar si ya existen).
  // No incluye fecha_real/fecha_plan/session_id: esas solo existieron en la forma vieja de
  // program_days (pre-rename a "fecha"); las DBs que las tenían ya las agregaron en su día,
  // y una DB nueva nace directo con "fecha" vía el CREATE TABLE de arriba — no hay que
  // reintroducirlas nunca.
  for (const col of [
    "ALTER TABLE program_days ADD COLUMN hora_inicio TEXT",
    "ALTER TABLE program_days ADD COLUMN hora_fin TEXT",
    "ALTER TABLE program_days ADD COLUMN notas TEXT",
    "ALTER TABLE program_sets ADD COLUMN target_peso REAL",
    "ALTER TABLE program_weeks ADD COLUMN mesociclo_id INTEGER REFERENCES mesociclos(id) ON DELETE SET NULL",
    // Enciclopedia de ejercicios (ver docs/adr/0001). Todas nullable: se pueblan en
    // la fase 2 (curación de datos), no acá. Identidad de la variante:
    "ALTER TABLE exercises ADD COLUMN patron_id INTEGER REFERENCES patrones(id)",
    "ALTER TABLE exercises ADD COLUMN ejercicio_padre_id INTEGER REFERENCES exercises(id)",
    "ALTER TABLE exercises ADD COLUMN tipo_variante TEXT",
    "ALTER TABLE exercises ADD COLUMN transferencia REAL",
    "ALTER TABLE exercises ADD COLUMN proposito TEXT",
    "ALTER TABLE exercises ADD COLUMN implemento TEXT",
    "ALTER TABLE exercises ADD COLUMN angulo_grados INTEGER",
    "ALTER TABLE exercises ADD COLUMN agarre TEXT",
    "ALTER TABLE exercises ADD COLUMN postura TEXT",
    "ALTER TABLE exercises ADD COLUMN unilateral INTEGER",
    // Biomecánica:
    "ALTER TABLE exercises ADD COLUMN mecanica TEXT",
    "ALTER TABLE exercises ADD COLUMN fuerza TEXT",
    "ALTER TABLE exercises ADD COLUMN sesgo_longitud TEXT",
    "ALTER TABLE exercises ADD COLUMN perfil_resistencia TEXT",
    "ALTER TABLE exercises ADD COLUMN cadena TEXT",
    "ALTER TABLE exercises ADD COLUMN carga_axial INTEGER",
    // Costo — heurístico declarado, no medición (ver ADR):
    "ALTER TABLE exercises ADD COLUMN costo_fatiga INTEGER",
    "ALTER TABLE exercises ADD COLUMN demanda_estabilidad INTEGER",
    "ALTER TABLE exercises ADD COLUMN demanda_tecnica INTEGER",
    // Tracking y texto:
    "ALTER TABLE exercises ADD COLUMN rastrea_e1rm INTEGER",
    "ALTER TABLE exercises ADD COLUMN es_competitivo INTEGER",
    "ALTER TABLE exercises ADD COLUMN notas_tecnicas TEXT",
    "ALTER TABLE exercises ADD COLUMN contraindicaciones TEXT",
    "ALTER TABLE exercises ADD COLUMN cues TEXT",
  ]) {
    try { db.exec(col); } catch { /* columna ya existe */ }
  }

  // tipo A/B → texto libre opcional en program_days. SQLite no soporta ALTER COLUMN/DROP
  // CONSTRAINT, así que hay que recrear la tabla para sacar el CHECK viejo. Idempotente: solo
  // corre si el CHECK sigue presente en el DDL guardado.
  dropTipoCheckProgramDays();

  // semana única global → única por mesociclo (mesociclo_id, semana). Requiere recrear
  // la tabla porque el UNIQUE viejo está en la definición de columna. Idempotente: solo
  // corre si el UNIQUE global sigue presente en el DDL guardado.
  migrateSemanaUnique();

  // Días registrados (session_id no nulo) cuya fecha_real/fecha_plan quedaron NULL porque el
  // volcado (POST /days/:id/complete) resolvía la fecha con new Date() sin escribirla nunca en
  // program_days. Esa fecha solo existe en sessions.fecha — rescatarla antes de perderla.
  // Idempotente (WHERE fecha_real IS NULL) y no pisa fecha_real si ya tiene un valor propio.
  // Debe correr ANTES de dropSessionsYSets(), que borra sessions.
  backfillFechaRealDesdeSessions();

  // fecha_real/fecha_plan/session_id → fecha (renombrado, fecha_plan eliminado por no usarse
  // nunca, session_id eliminado junto con sessions). El atleta ya no "registra" el día: la
  // fecha se autosetea sola al completar la primera serie (PATCH /program/sets/:id).
  // Idempotente: solo corre si program_days todavía tiene la columna vieja fecha_real.
  migrateFechaRealAFecha();

  // sessions/sets eran una copia derivada de program_sets, poblada solo al apretar el botón
  // "Registrar día" (eliminado). Cero datos únicos tras el backfill de arriba — ver CLAUDE.md.
  // Debe correr DESPUÉS de backfillFechaRealDesdeSessions() y migrateFechaRealAFecha().
  dropSessionsYSets();

  // Columnas agregadas DESPUÉS de los recreates de program_days de arriba
  // (dropTipoCheckProgramDays/migrateFechaRealAFecha copian con INSERT..SELECT posicional: si
  // esta columna existiera antes de que corran, la aridad no coincide y el arranque falla).
  // notas_atleta: canal del atleta (editable), separado de notas (canal del coach, read-only
  // para el atleta). Ver CLAUDE.md.
  for (const col of [
    "ALTER TABLE program_days ADD COLUMN notas_atleta TEXT",
  ]) {
    try { db.exec(col); } catch { /* columna ya existe */ }
  }

  // v_sets_e1rm leía de sets (eliminada arriba); quedaba huérfana en DBs ya desplegadas porque
  // el CREATE VIEW viejo salió del DDL sin un DROP explícito que la limpiara.
  db.exec("DROP VIEW IF EXISTS v_sets_e1rm");

  // rm_squat/rm_bench/rm_deadlift eran los "1RM iniciales" del bootstrap. Ya no se usan: el
  // e1RM sale siempre de v_program_sets_e1rm (histórico + actual). Idempotente (un DELETE sin
  // match es no-op). No toca las claves de auth (coach_api_key, auth_*).
  db.exec("DELETE FROM settings WHERE clave IN ('rm_squat','rm_bench','rm_deadlift')");

  // v_program_sets_e1rm ganó la columna rir; CREATE VIEW IF NOT EXISTS no actualiza una vista
  // ya existente, así que hay que dropearla antes de que el CREATE de arriba la recree.
  db.exec("DROP VIEW IF EXISTS v_program_sets_e1rm");
  db.exec(`
    CREATE VIEW v_program_sets_e1rm AS
      SELECT
        ps.*,
        CASE WHEN ps.real_peso IS NOT NULL AND ps.real_reps IS NOT NULL
             THEN ROUND(ps.real_peso * (1 + ps.real_reps / 30.0), 1) END AS e1rm,
        CASE WHEN ps.real_peso IS NOT NULL AND ps.real_reps IS NOT NULL
             THEN ROUND(ps.real_peso * ps.real_reps, 1) END AS tonelaje,
        CASE WHEN ps.real_rpe IS NOT NULL
             THEN MAX(0, ROUND(10 - ps.real_rpe)) END AS rir
      FROM program_sets ps;
  `);

  // Volumen semanal fraccionado por músculo (reemplaza a volumen_por_categoria del
  // coach.ts, que agrupaba por implemento/región mezclados — ver ADR). Una serie de
  // remo no es "una serie de espalda": aporta 1.0 a dorsal ancho y 0.5 a bíceps.
  // Devuelve 0 filas hasta que ejercicio_musculos esté poblada (fase 2).
  db.exec("DROP VIEW IF EXISTS v_volumen_por_musculo");
  db.exec(`
    CREATE VIEW v_volumen_por_musculo AS
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
        -- Los estabilizadores tienen fraccion_volumen = 0: sin este filtro
        -- aparecerían como filas en 0 inflando el payload del coach sin aportar.
        AND em.fraccion_volumen > 0
      GROUP BY semana, m.id
      ORDER BY semana, m.grupo, m.nombre;
  `);
}

function backfillFechaRealDesdeSessions(): void {
  const tableExists = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='sessions'")
    .get();
  if (!tableExists) return; // ya migrado a la nueva forma sin sessions

  const cols = db.prepare("PRAGMA table_info(program_days)").all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === "fecha_real")) return; // ya renombrada a fecha

  db.exec(`
    UPDATE program_days
       SET fecha_real = (SELECT s.fecha FROM sessions s WHERE s.id = program_days.session_id)
     WHERE fecha_real IS NULL
       AND session_id IS NOT NULL;
  `);
}

function migrateFechaRealAFecha(): void {
  const cols = db.prepare("PRAGMA table_info(program_days)").all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === "fecha_real")) return; // ya migrado

  db.pragma("foreign_keys = OFF");
  const tx = db.transaction(() => {
    db.exec(`
      CREATE TABLE program_days_new (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        week_id     INTEGER NOT NULL REFERENCES program_weeks(id) ON DELETE CASCADE,
        dia         INTEGER NOT NULL,
        tipo        TEXT,
        titulo      TEXT,
        warmup      TEXT,
        notas       TEXT,
        fecha       TEXT,
        hora_inicio TEXT,
        hora_fin    TEXT,
        orden       INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO program_days_new (id, week_id, dia, tipo, titulo, warmup, notas, fecha, hora_inicio, hora_fin, orden)
        SELECT id, week_id, dia, tipo, titulo, warmup, notas, COALESCE(fecha_real, fecha_plan), hora_inicio, hora_fin, orden
        FROM program_days;
      DROP TABLE program_days;
      ALTER TABLE program_days_new RENAME TO program_days;
    `);
  });
  tx();
  db.pragma("foreign_keys = ON");
}

function dropSessionsYSets(): void {
  db.exec("DROP TABLE IF EXISTS sets");
  db.exec("DROP TABLE IF EXISTS sessions");
}

function dropTipoCheckProgramDays(): void {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='program_days'")
    .get() as { sql: string } | undefined;
  if (!row || !/CHECK\s*\(\s*tipo\s+IN/i.test(row.sql)) return; // ya migrado o no existe

  db.pragma("foreign_keys = OFF");
  const tx = db.transaction(() => {
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

// El seed del catálogo de ejercicios (biomecánica + músculos) vive en
// server/src/seed/. Reemplaza al viejo EXERCISE_LIBRARY, que solo insertaba
// nombre/categoria si la tabla estaba vacía: el seed nuevo hace upsert por
// nombre, así que también completa DBs ya desplegadas sin tocar sus ids.

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

export function initDb(): void {
  migrate();
  seedEnciclopedia(db);
  console.log(`[db] listo en ${DB_PATH}`);
}
