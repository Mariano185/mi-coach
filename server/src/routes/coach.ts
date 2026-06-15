import { Router } from "express";
import { db } from "../db.js";

export const coachRouter = Router();

// GET /api/coach/analisis — todo lo que el coach lee para programar la semana nueva,
// en un solo JSON. El coach es caja negra: pega un curl acá, no toca SQL ni el archivo.
//   ?dias=42  ventana de análisis (default 42 = ~6 semanas)
coachRouter.get("/analisis", (req, res) => {
  const dias = Number(req.query.dias) || 42;
  const desde = `-${dias} days`;

  // 1) Mejor e1RM por básico vs 1RM inicial (settings).
  const mejor_e1rm_basicos = db
    .prepare(
      `SELECT e.nombre, MAX(v.e1rm) AS mejor_e1rm
       FROM exercises e
       JOIN v_sets_e1rm v ON v.exercise_id = e.id
       WHERE e.es_basico = 1
       GROUP BY e.id, e.nombre`
    )
    .all();

  const settings = db.prepare("SELECT clave, valor FROM settings").all();

  // 2) Progresión e1RM por básico en la ventana (serie temporal por sesión).
  const progresion_basicos = db
    .prepare(
      `SELECT e.nombre, s.fecha, st.peso_kg, st.reps, st.rpe,
              ROUND(st.peso_kg * (1 + st.reps/30.0), 1) AS e1rm
       FROM sets st
       JOIN sessions s ON s.id = st.session_id
       JOIN exercises e ON e.id = st.exercise_id
       WHERE e.es_basico = 1 AND s.fecha >= date('now', ?)
       ORDER BY e.nombre, s.fecha, st.n_serie`
    )
    .all(desde);

  // 3) RPE promedio por básico por sesión (señal de fatiga).
  const rpe_basicos = db
    .prepare(
      `SELECT e.nombre, s.fecha, ROUND(AVG(st.rpe), 1) AS rpe_prom
       FROM sets st
       JOIN sessions s ON s.id = st.session_id
       JOIN exercises e ON e.id = st.exercise_id
       WHERE e.es_basico = 1 AND s.fecha >= date('now', ?)
       GROUP BY e.nombre, s.fecha
       ORDER BY e.nombre, s.fecha`
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
      `SELECT strftime('%Y-%W', s.fecha) AS semana, e.categoria, COUNT(*) AS series
       FROM sets st
       JOIN sessions s ON s.id = st.session_id
       JOIN exercises e ON e.id = st.exercise_id
       WHERE s.fecha >= date('now', ?)
       GROUP BY semana, e.categoria
       ORDER BY semana, e.categoria`
    )
    .all(desde);

  // 6) Bienestar reciente (energía, sueño, motivación, molestias).
  const bienestar_reciente = db
    .prepare(
      `SELECT fecha, tipo, energia, sueno_horas, motivacion, dolor_molestias
       FROM sessions
       ORDER BY fecha DESC
       LIMIT 8`
    )
    .all();

  // 7) Library de ejercicios (para mapear nombre → id al armar la semana).
  const ejercicios = db
    .prepare("SELECT id, nombre, categoria, es_basico FROM exercises ORDER BY id")
    .all();

  // 8) Última semana programada (para numerar la próxima = max + 1).
  const ultima_semana = db
    .prepare("SELECT MAX(semana) AS max_semana FROM program_weeks")
    .get();

  // 9) Sesiones realizadas: fecha real + horarios + duración (para analizar
  //    frecuencia, días consecutivos y fatiga acumulada). Solo días con actividad
  //    (al menos una serie hecha o ya registrados al historial), en la ventana.
  //    duracion_min se calcula cuando hay hora_inicio y hora_fin (mismo día).
  const sesiones_realizadas = db
    .prepare(
      `SELECT
         pw.semana,
         pd.dia,
         pd.tipo,
         COALESCE(pd.fecha_real, pd.fecha_plan) AS fecha,
         pd.hora_inicio,
         pd.hora_fin,
         CASE WHEN pd.hora_inicio IS NOT NULL AND pd.hora_fin IS NOT NULL
              THEN (
                (CAST(substr(pd.hora_fin,1,2) AS INTEGER)*60 + CAST(substr(pd.hora_fin,4,2) AS INTEGER))
                - (CAST(substr(pd.hora_inicio,1,2) AS INTEGER)*60 + CAST(substr(pd.hora_inicio,4,2) AS INTEGER))
                + 1440
              ) % 1440
         END AS duracion_min,
         (pd.session_id IS NOT NULL) AS registrada,
         (SELECT COUNT(*) FROM program_sets ps
            JOIN program_exercises pe ON pe.id = ps.program_exercise_id
            WHERE pe.day_id = pd.id AND ps.hecha = 1) AS series_hechas
       FROM program_days pd
       JOIN program_weeks pw ON pw.id = pd.week_id
       WHERE COALESCE(pd.fecha_real, pd.fecha_plan) >= date('now', ?)
         AND (
           pd.session_id IS NOT NULL
           OR EXISTS (
             SELECT 1 FROM program_sets ps
             JOIN program_exercises pe ON pe.id = ps.program_exercise_id
             WHERE pe.day_id = pd.id AND ps.hecha = 1
           )
         )
       ORDER BY fecha, pd.hora_inicio`
    )
    .all(desde);

  res.json({
    ventana_dias: dias,
    mejor_e1rm_basicos,
    settings,
    progresion_basicos,
    rpe_basicos,
    peso_corporal,
    volumen_por_categoria,
    bienestar_reciente,
    ejercicios,
    ultima_semana,
    sesiones_realizadas,
  });
});
