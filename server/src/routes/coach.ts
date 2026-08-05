import { Router } from "express";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "../db.js";
import type {
  AdherenciaPorEjercicio,
  AdherenciaPorLargo,
  AdherenciaPorPosicion,
  CoachDocsAnalisisBloque,
  CoachDocsEndpoint,
  CoachDocsResponse,
  CoachDocsSeccion,
  DiaProgramado,
  ProgresionBasico,
} from "../types.js";

export const coachRouter = Router();

// La lista de endpoints del coach solo la conoce index.ts (es el único lugar
// que sabe con qué prefijo se montó cada router). Se inyecta una vez al
// arrancar, después de montar todo — ver setEndpointsCoach() más abajo.
let ENDPOINTS_COACH: CoachDocsEndpoint[] = [];
export function setEndpointsCoach(endpoints: CoachDocsEndpoint[]): void {
  ENDPOINTS_COACH = endpoints;
}

// "Se le sigue el e1RM": los movimientos de competencia. rastrea_e1rm reemplaza a
// es_basico; COALESCE mantiene el comportamiento en una DB que todavía no corrió
// el seed de la enciclopedia (rastrea_e1rm en NULL). Ver docs/adr/0001.
const RASTREA_E1RM = "COALESCE(e.rastrea_e1rm, e.es_basico) = 1";

// Bloques que NO viajan por defecto: hay que pedirlos con ?incluir=bloque1,bloque2.
// Hoy solo `ejercicios` (148 filas, ~55% del payload de /analisis, cuando el coach usa
// 6-7 por semana) — ya existe GET /api/exercises para pedir el catálogo completo aparte.
const BLOQUES_OPT_IN = ["ejercicios"] as const;
type BloqueOptIn = (typeof BLOQUES_OPT_IN)[number];

// Arma el objeto de /analisis. Extraído a función para que GET /docs pueda pedir
// Object.keys() de una respuesta real como generado.analisis_bloques, en vez de
// mantener la lista de bloques a mano en otro lugar (eso es lo que se desincroniza).
// `incluir` son los bloques opt-in a sumar además del default.
function buildAnalisis(dias: number, incluir: Set<BloqueOptIn> = new Set()): Record<string, unknown> {
  const desde = `-${dias} days`;

  // 1) Mejor e1RM histórico por básico.
  const mejor_e1rm_basicos = db
    .prepare(
      `SELECT e.nombre, MAX(v.e1rm) AS mejor_e1rm
       FROM exercises e
       JOIN program_exercises pe ON pe.exercise_id = e.id
       JOIN v_program_sets_e1rm v ON v.program_exercise_id = pe.id
       WHERE ${RASTREA_E1RM} AND v.e1rm IS NOT NULL
       GROUP BY e.id, e.nombre`
    )
    .all();

  // 2) Progresión e1RM por básico en la ventana. Agrupada por (nombre, fecha, peso_kg,
  //    reps) — no por serie ni por sesión. El e1RM es función de peso×reps, así que
  //    repetirlo por serie no aporta nada; pero agrupar solo por (nombre, fecha) SÍ
  //    pierde información: top set + back-off del mismo día (11 de 34 sesiones reales,
  //    ej. Bench 80×4 + 75×4) tienen dos pesos distintos y un e1RM cada uno — agruparlos
  //    dejaría un peso_kg ambiguo. rpe_min/rpe_max conservan la fatiga intra-sesión
  //    (ej. RPE 7→8→8→8.5 en la misma carga) que un promedio (ya cubierto por
  //    rpe_basicos) borraría.
  const progresion_basicos = db
    .prepare(
      `SELECT e.nombre, pd.fecha, ps.real_peso AS peso_kg, ps.real_reps AS reps,
              v.e1rm, MIN(ps.real_rpe) AS rpe_min, MAX(ps.real_rpe) AS rpe_max,
              COUNT(*) AS n_series
       FROM v_program_sets_e1rm v
       JOIN program_sets ps ON ps.id = v.id
       JOIN program_exercises pe ON pe.id = ps.program_exercise_id
       JOIN program_days pd ON pd.id = pe.day_id
       JOIN exercises e ON e.id = pe.exercise_id
       WHERE ${RASTREA_E1RM} AND v.e1rm IS NOT NULL AND pd.fecha >= date('now', ?)
       GROUP BY e.nombre, pd.fecha, ps.real_peso, ps.real_reps
       ORDER BY e.nombre, pd.fecha, ps.real_peso DESC`
    )
    .all(desde) as ProgresionBasico[];

  // 3) RPE promedio por básico por día entrenado (señal de fatiga).
  const rpe_basicos = db
    .prepare(
      `SELECT e.nombre, pd.fecha, ROUND(AVG(ps.real_rpe), 1) AS rpe_prom
       FROM program_sets ps
       JOIN program_exercises pe ON pe.id = ps.program_exercise_id
       JOIN program_days pd ON pd.id = pe.day_id
       JOIN exercises e ON e.id = pe.exercise_id
       WHERE ${RASTREA_E1RM} AND ps.hecha = 1 AND pd.fecha >= date('now', ?)
       GROUP BY e.nombre, pd.fecha
       ORDER BY e.nombre, pd.fecha`
    )
    .all(desde);

  // 4) Tendencia de peso corporal (promedio móvil 7d).
  const peso_corporal = db
    .prepare(
      `SELECT fecha, peso_kg,
              ROUND(AVG(peso_kg) OVER (ORDER BY fecha ROWS BETWEEN 6 PRECEDING AND CURRENT ROW), 2) AS pm_7d
       FROM bodyweight
       ORDER BY fecha`
    )
    .all();

  // 5) Volumen semanal POR MÚSCULO, fraccionado. Reemplaza al viejo
  // volumen_por_categoria, que agrupaba por un campo que mezclaba implemento,
  // región y rol: "Smith/Multipower: 16 series" no decía nada sobre qué se
  // entrenó realmente. Una serie de remo aporta 1.0 al dorsal y 0.5 al bíceps;
  // los estabilizadores no acumulan volumen. Ver docs/adr/0001.
  // Ya respeta ?dias= (verificado: dias=42 -> 7 semanas ISO, dias=14 -> 3). El bloque
  // pesa por ser 7 semanas × ~29 músculos, no por una ventana mal acotada.
  const volumen_por_musculo = db
    .prepare(
      `SELECT semana, musculo, grupo, series
       FROM v_volumen_por_musculo
       WHERE semana >= strftime('%Y-%W', date('now', ?))
       ORDER BY semana, grupo, musculo`
    )
    .all(desde);

  // 7) Library de ejercicios: forma COMPACTA a propósito. Con 90+ ejercicios,
  // mandar la biomecánica completa de cada uno infla el payload sin que el coach
  // la necesite para el 90% de las decisiones. El detalle (músculos, sesgo de
  // longitud, contraindicaciones) se pide por GET /api/exercises/:id o
  // GET /api/exercises?detalle=full cuando hace falta elegir entre variantes.
  //
  // OPT-IN (?incluir=ejercicios): son 148 filas (~55% del payload) para elegir 6-7
  // por semana, y GET /api/exercises ya cubre "traeme el catálogo". No se ejecuta
  // la query si no fue pedida — no vale pagar el costo para descartar el resultado.
  const ejercicios = incluir.has("ejercicios")
    ? db
        .prepare(
          `SELECT e.id, e.nombre, p.nombre AS patron, e.implemento, e.mecanica,
                  e.ejercicio_padre_id, e.tipo_variante, e.proposito,
                  e.costo_fatiga, e.sesgo_longitud,
                  COALESCE(e.rastrea_e1rm, e.es_basico) AS rastrea_e1rm
           FROM exercises e
           LEFT JOIN patrones p ON p.id = e.patron_id
           ORDER BY e.id`
        )
        .all()
    : undefined;

  // 8) Última semana programada (para numerar la próxima = max + 1).
  // Deprecado desde que existen mesociclos: la numeración ahora se reinicia por
  // mesociclo, ver el bloque `mesociclos` más abajo (max_semana es por mesociclo).
  const ultima_semana = db
    .prepare("SELECT MAX(semana) AS max_semana FROM program_weeks")
    .get();

  // 8b) Mesociclos con su semana máxima (para numerar la próxima semana de cada uno = max + 1).
  const mesociclos = db
    .prepare(
      `SELECT m.id, m.nombre, m.objetivo,
         (SELECT COUNT(*) FROM program_weeks pw WHERE pw.mesociclo_id = m.id) AS n_semanas,
         (SELECT MAX(semana) FROM program_weeks pw WHERE pw.mesociclo_id = m.id) AS max_semana
       FROM mesociclos m
       ORDER BY m.orden DESC, m.id DESC`
    )
    .all();

  // 9) Sesiones realizadas: fecha + horarios + duración (para analizar frecuencia, días
  //    consecutivos y fatiga acumulada). Solo días con al menos una serie hecha, en la ventana.
  //    duracion_min se calcula cuando hay hora_inicio y hora_fin (mismo día).
  //    notas_coach: lo que el coach escribió para el día (canal propio, editable por el coach).
  //    notas_atleta: lo que el atleta escribió sobre el día (dolor, sensaciones, contexto).
  const sesiones_realizadas = db
    .prepare(
      `SELECT
         pw.semana,
         pd.dia,
         pd.tipo,
         pd.fecha,
         pd.hora_inicio,
         pd.hora_fin,
         pd.notas         AS notas_coach,
         pd.notas_atleta  AS notas_atleta,
         CASE WHEN pd.hora_inicio IS NOT NULL AND pd.hora_fin IS NOT NULL
              THEN (
                (CAST(substr(pd.hora_fin,1,2) AS INTEGER)*60 + CAST(substr(pd.hora_fin,4,2) AS INTEGER))
                - (CAST(substr(pd.hora_inicio,1,2) AS INTEGER)*60 + CAST(substr(pd.hora_inicio,4,2) AS INTEGER))
                + 1440
              ) % 1440
         END AS duracion_min,
         (SELECT COUNT(*) FROM program_sets ps
            JOIN program_exercises pe ON pe.id = ps.program_exercise_id
            WHERE pe.day_id = pd.id AND ps.hecha = 1) AS series_hechas
       FROM program_days pd
       JOIN program_weeks pw ON pw.id = pd.week_id
       WHERE pd.fecha >= date('now', ?)
         AND EXISTS (
           SELECT 1 FROM program_sets ps
           JOIN program_exercises pe ON pe.id = ps.program_exercise_id
           WHERE pe.day_id = pd.id AND ps.hecha = 1
         )
       ORDER BY fecha, pd.hora_inicio`
    )
    .all(desde);

  // 10) Trac: bienestar/recuperación de los últimos 7 días (fijo, no ligado a ?dias=).
  //     Serie de fechas generada explícitamente + LEFT JOIN, para que los días sin
  //     registro aparezcan con huecos en null en vez de faltar directamente.
  const trac_reciente = db
    .prepare(
      `WITH RECURSIVE fechas(fecha) AS (
         SELECT date('now', '-6 days')
         UNION ALL
         SELECT date(fecha, '+1 day') FROM fechas WHERE fecha < date('now')
       )
       SELECT
         f.fecha,
         t.fatiga_pierna, t.fatiga_empuje, t.fatiga_traccion,
         t.descanso_alimentacion, t.recuperacion, t.motivacion, t.tecnica
       FROM fechas f
       LEFT JOIN trac t ON t.fecha = f.fecha
       ORDER BY f.fecha ASC`
    )
    .all();

  // 11) Días programados vs. completados, incluyendo días NUNCA empezados (fecha NULL).
  //     A diferencia de todos los bloques anteriores, este NO filtra por pd.fecha —
  //     un día sin entrenar no tiene fecha, así que ese filtro lo dejaría invisible
  //     (justo el caso que este bloque existe para mostrar: "19 programadas, 0 hechas").
  //
  //     La ventana se define por pw.fecha_creada (NOT NULL, siempre existe) en vez de
  //     por pd.fecha. Alternativas descartadas:
  //       - `OR pd.fecha IS NULL` a secas: arrastra para siempre cualquier día viejo
  //         nunca entrenado, sin límite de tiempo.
  //       - Acotar por mesociclo: mesociclos está vacío hoy y las semanas existentes
  //         tienen mesociclo_id NULL; cuando se empiecen a usar, la semana 1 de un
  //         mesociclo nuevo dejaría fuera todo lo anterior.
  //     El EXISTS cubre el caso raro de una semana creada hace tiempo que se sigue
  //     entrenando ahora (fecha_creada vieja, pero actividad reciente).
  //
  //     LEFT JOIN mesociclos (no JOIN): hoy las semanas tienen mesociclo_id NULL: con
  //     JOIN normal desaparecerían todas.
  //     Subqueries correlacionadas (no JOIN + GROUP BY) para series_programadas/
  //     series_completadas: así un día sin ningún ejercicio sigue apareciendo con 0/0
  //     en vez de caerse del resultado — mismo patrón que GET /program/weeks/:id.
  //     ORDER BY pw.id (no pw.semana): semana se reinicia por mesociclo
  //     (UNIQUE(mesociclo_id, semana)), pw.id es monotónico y no ambiguo entre mesociclos.
  const dias_programados = db
    .prepare(
      `SELECT
         m.id      AS mesociclo_id,
         m.nombre  AS mesociclo_nombre,
         pw.semana,
         pd.dia,
         pd.titulo,
         pd.tipo,
         pd.fecha,
         (SELECT COUNT(*) FROM program_sets ps
            JOIN program_exercises pe ON pe.id = ps.program_exercise_id
            WHERE pe.day_id = pd.id) AS series_programadas,
         (SELECT COUNT(*) FROM program_sets ps
            JOIN program_exercises pe ON pe.id = ps.program_exercise_id
            WHERE pe.day_id = pd.id AND ps.hecha = 1) AS series_completadas
       FROM program_days pd
       JOIN program_weeks pw ON pw.id = pd.week_id
       LEFT JOIN mesociclos m ON m.id = pw.mesociclo_id
       WHERE pw.fecha_creada >= date('now', ?)
          OR EXISTS (
            SELECT 1 FROM program_days pd2
            WHERE pd2.week_id = pw.id AND pd2.fecha >= date('now', ?)
          )
       ORDER BY pw.id, pd.orden, pd.dia`
    )
    .all(desde, desde) as DiaProgramado[];

  return {
    ventana_dias: dias,
    mejor_e1rm_basicos,
    progresion_basicos,
    rpe_basicos,
    peso_corporal,
    volumen_por_musculo,
    // Spread condicional: si `ejercicios` no fue pedido, la clave ni existe en el
    // objeto (no "ejercicios": null) — así Object.keys() la refleja bien tanto en
    // /analisis como en generado.analisis_bloques de /coach/docs.
    ...(ejercicios !== undefined ? { ejercicios } : {}),
    ultima_semana,
    mesociclos,
    sesiones_realizadas,
    trac_reciente,
    dias_programados,
  };
}

// GET /api/coach/analisis — todo lo que el coach lee para programar la semana nueva,
// en un solo JSON. El coach es caja negra: pega un curl acá, no toca SQL ni el archivo.
//   ?dias=42     ventana de análisis (default 42 = ~6 semanas)
//   ?incluir=    bloques opt-in, separados por coma (hoy solo "ejercicios") — no
//                viajan por defecto, ver BLOQUES_OPT_IN.
coachRouter.get("/analisis", (req, res) => {
  const dias = Number(req.query.dias) || 42;
  const incluirRaw = typeof req.query.incluir === "string" ? req.query.incluir.split(",") : [];
  const incluir = new Set(
    incluirRaw.filter((b): b is BloqueOptIn => (BLOQUES_OPT_IN as readonly string[]).includes(b))
  );
  res.json(buildAnalisis(dias, incluir));
});

// GET /api/coach/adherencia — adherencia por posición en el día: ¿los ejercicios que van
// más tarde en el orden del día se completan menos, sin importar cuál sean? (pedido del
// coach: "si los ejercicios 5-6 se caen sistemáticamente, el problema es que estoy
// programando días demasiado largos").
//
// Solo entran días con fecha (efectivamente entrenados) — un día programado y nunca
// empezado hundiría el pct de TODAS las posiciones por igual sin decir nada sobre el
// efecto-posición; ese caso lo cubre el bloque `dias_programados` de /analisis.
// La posición es un rank denso (ROW_NUMBER), no `pe.orden` crudo: hay datos viejos con
// varios ejercicios en orden=0 (el DEFAULT antes del endpoint de reorder).
//   ?dias=90  ventana de análisis (default 90: varias semanas para que el patrón signifique algo)
coachRouter.get("/adherencia", (req, res) => {
  const dias = Number(req.query.dias) || 90;
  const desde = `-${dias} days`;

  const CTE = `
    WITH ejercicios_posicionados AS (
      SELECT
        pe.id     AS pe_id,
        pe.day_id AS day_id,
        COALESCE(e.nombre, pe.nombre_libre) AS nombre,
        ROW_NUMBER() OVER (PARTITION BY pe.day_id ORDER BY pe.orden, pe.id) AS posicion,
        COUNT(*)   OVER (PARTITION BY pe.day_id) AS n_ejercicios_dia
      FROM program_exercises pe
      JOIN program_days pd  ON pd.id = pe.day_id
      LEFT JOIN exercises e ON e.id = pe.exercise_id
      WHERE pd.fecha IS NOT NULL
        AND pd.fecha >= date('now', ?)
        AND EXISTS (SELECT 1 FROM program_sets ps WHERE ps.program_exercise_id = pe.id)
    ),
    series AS (
      SELECT ep.pe_id, ep.day_id, ep.nombre, ep.posicion, ep.n_ejercicios_dia,
             COUNT(*)                                      AS programadas,
             SUM(CASE WHEN ps.hecha = 1 THEN 1 ELSE 0 END) AS completadas
      FROM ejercicios_posicionados ep
      JOIN program_sets ps ON ps.program_exercise_id = ep.pe_id
      GROUP BY ep.pe_id
    )`;

  const por_posicion = db
    .prepare(
      `${CTE}
       SELECT posicion,
              COUNT(DISTINCT day_id)  AS dias,
              SUM(programadas)        AS series_programadas,
              SUM(completadas)        AS series_completadas,
              ROUND(100.0 * SUM(completadas) / SUM(programadas), 1) AS pct
       FROM series GROUP BY posicion ORDER BY posicion`
    )
    .all(desde) as AdherenciaPorPosicion[];

  const por_largo_de_dia = db
    .prepare(
      `${CTE}
       SELECT n_ejercicios_dia, posicion,
              COUNT(DISTINCT day_id)  AS dias,
              SUM(programadas)        AS series_programadas,
              SUM(completadas)        AS series_completadas,
              ROUND(100.0 * SUM(completadas) / SUM(programadas), 1) AS pct
       FROM series GROUP BY n_ejercicios_dia, posicion ORDER BY n_ejercicios_dia, posicion`
    )
    .all(desde) as AdherenciaPorLargo[];

  const por_ejercicio = db
    .prepare(
      `${CTE}
       SELECT nombre,
              COUNT(DISTINCT day_id)       AS dias,
              ROUND(AVG(posicion), 1)      AS posicion_prom,
              SUM(programadas)             AS series_programadas,
              SUM(completadas)             AS series_completadas,
              ROUND(100.0 * SUM(completadas) / SUM(programadas), 1) AS pct
       FROM series
       GROUP BY nombre
       HAVING SUM(programadas) >= 3
       ORDER BY pct ASC`
    )
    .all(desde) as AdherenciaPorEjercicio[];

  const dias_analizados = db
    .prepare(
      `${CTE}
       SELECT COUNT(DISTINCT day_id) AS n FROM series`
    )
    .get(desde) as { n: number };

  res.json({
    ventana_dias: dias,
    dias_analizados: dias_analizados.n,
    por_posicion,
    por_largo_de_dia,
    por_ejercicio,
  });
});

// GET /api/coach/docs — la doc operativa del coach, servida desde el repo para que
// no pueda desincronizarse del código que describe (ver docs/adr y CLAUDE.md sobre
// por qué el coach lee esto por HTTP en vez de tener una copia a mano en su propio
// directorio). Dos capas en la respuesta:
//   - generado: introspección de runtime (endpoints reales, claves reales de
//     /analisis) — imposible que quede vieja porque no la escribe nadie a mano.
//   - secciones: prosa (criterio, caveats, ejemplos) migrada de la doc del coach,
//     leída de los .md en src/docs/ (dev) o dist/docs/ (prod, copiados en el build
//     por scripts/copy-docs.mjs — tsc no copia .md).
//   ?seccion=<id>  devuelve solo esa sección (404 si no existe)
const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = resolve(__dirname, "..", "docs");
const VERSION_DEPLOY = new Date().toISOString(); // fecha de arranque del proceso

let seccionesCache: CoachDocsSeccion[] | null = null;
function leerSecciones(): CoachDocsSeccion[] {
  if (seccionesCache) return seccionesCache;
  let archivos: string[] = [];
  try {
    archivos = readdirSync(DOCS_DIR).filter((f) => f.endsWith(".md"));
  } catch {
    seccionesCache = [];
    return seccionesCache;
  }
  seccionesCache = archivos
    .sort()
    .map((archivo) => {
      const markdown = readFileSync(resolve(DOCS_DIR, archivo), "utf-8");
      const primerHeading = markdown.match(/^#\s+(.+)$/m);
      return {
        id: basename(archivo, ".md"),
        titulo: primerHeading ? primerHeading[1].trim() : basename(archivo, ".md"),
        markdown,
      };
    });
  return seccionesCache;
}

// Las claves de /analisis no dependen de los datos ni de `dias` (son literales del
// objeto), así que alcanza con derivarlas una vez. Se corre buildAnalisis() dos veces
// (sin y con todos los opt-in) para que la lista marque qué bloques hay que pedir con
// ?incluir= — si un bloque opt-in no apareciera acá, el coach no tendría forma de
// enterarse de que existe salvo leyendo la prosa de /coach/docs, que es justo lo que
// esta capa "generada" existe para no depender de.
let analisisBloquesCache: CoachDocsAnalisisBloque[] | null = null;
function getAnalisisBloques(): CoachDocsAnalisisBloque[] {
  if (analisisBloquesCache) return analisisBloquesCache;
  const bloquesDefault = new Set(Object.keys(buildAnalisis(42)));
  const bloquesConTodo = Object.keys(buildAnalisis(42, new Set(BLOQUES_OPT_IN)));
  analisisBloquesCache = bloquesConTodo.map((bloque) => ({
    bloque,
    opt_in: !bloquesDefault.has(bloque),
  }));
  return analisisBloquesCache;
}

coachRouter.get("/docs", (req, res) => {
  const secciones = leerSecciones();
  const seccionQuery = req.query.seccion as string | undefined;
  const generado = {
    endpoints: ENDPOINTS_COACH,
    analisis_bloques: getAnalisisBloques(),
    version_deploy: VERSION_DEPLOY,
  };

  if (seccionQuery !== undefined) {
    const seccion = secciones.find((s) => s.id === seccionQuery);
    if (!seccion) return res.status(404).json({ error: `sección "${seccionQuery}" no encontrada` });
    return res.json({ generado, secciones: [seccion] } satisfies CoachDocsResponse);
  }

  res.json({ generado, secciones } satisfies CoachDocsResponse);
});
