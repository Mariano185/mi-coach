import { Router } from "express";
import { db } from "../db.js";

export const coachRouter = Router();

// GET /api/coach/analisis — todo lo que el coach lee para programar la semana nueva,
// en un solo JSON. El coach es caja negra: pega un curl acá, no toca SQL ni el archivo.
//   ?dias=42  ventana de análisis (default 42 = ~6 semanas)
coachRouter.get("/analisis", (req, res) => {
  const dias = Number(req.query.dias) || 42;
  const desde = `-${dias} days`;

  // 1) Mejor e1RM histórico por básico.
  const mejor_e1rm_basicos = db
    .prepare(
      `SELECT e.nombre, MAX(v.e1rm) AS mejor_e1rm
       FROM exercises e
       JOIN program_exercises pe ON pe.exercise_id = e.id
       JOIN v_program_sets_e1rm v ON v.program_exercise_id = pe.id
       WHERE e.es_basico = 1 AND v.e1rm IS NOT NULL
       GROUP BY e.id, e.nombre`
    )
    .all();

  // 2) Progresión e1RM por básico en la ventana (serie temporal por día entrenado).
  const progresion_basicos = db
    .prepare(
      `SELECT e.nombre, pd.fecha, ps.real_peso AS peso_kg, ps.real_reps AS reps,
              ps.real_rpe AS rpe, v.e1rm
       FROM v_program_sets_e1rm v
       JOIN program_sets ps ON ps.id = v.id
       JOIN program_exercises pe ON pe.id = ps.program_exercise_id
       JOIN program_days pd ON pd.id = pe.day_id
       JOIN exercises e ON e.id = pe.exercise_id
       WHERE e.es_basico = 1 AND v.e1rm IS NOT NULL AND pd.fecha >= date('now', ?)
       ORDER BY e.nombre, pd.fecha, ps.n_serie`
    )
    .all(desde);

  // 3) RPE promedio por básico por día entrenado (señal de fatiga).
  const rpe_basicos = db
    .prepare(
      `SELECT e.nombre, pd.fecha, ROUND(AVG(ps.real_rpe), 1) AS rpe_prom
       FROM program_sets ps
       JOIN program_exercises pe ON pe.id = ps.program_exercise_id
       JOIN program_days pd ON pd.id = pe.day_id
       JOIN exercises e ON e.id = pe.exercise_id
       WHERE e.es_basico = 1 AND ps.hecha = 1 AND pd.fecha >= date('now', ?)
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

  // 5) Volumen semanal por categoría (no saturar por sesión).
  const volumen_por_categoria = db
    .prepare(
      `SELECT strftime('%Y-%W', pd.fecha) AS semana, e.categoria, COUNT(*) AS series
       FROM program_sets ps
       JOIN program_exercises pe ON pe.id = ps.program_exercise_id
       JOIN program_days pd ON pd.id = pe.day_id
       JOIN exercises e ON e.id = pe.exercise_id
       WHERE ps.hecha = 1 AND pd.fecha >= date('now', ?)
       GROUP BY semana, e.categoria
       ORDER BY semana, e.categoria`
    )
    .all(desde);

  // 7) Library de ejercicios (para mapear nombre → id al armar la semana).
  const ejercicios = db
    .prepare("SELECT id, nombre, categoria, es_basico FROM exercises ORDER BY id")
    .all();

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

  res.json({
    ventana_dias: dias,
    mejor_e1rm_basicos,
    progresion_basicos,
    rpe_basicos,
    peso_corporal,
    volumen_por_categoria,
    ejercicios,
    ultima_semana,
    mesociclos,
    sesiones_realizadas,
    trac_reciente,
  });
});
