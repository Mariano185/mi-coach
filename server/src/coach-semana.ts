import type Database from "better-sqlite3";
import { calendarioDesdeDb, type Calendario } from "./calendario.js";
import type {
  IngestaDiaria,
  NutricionDia,
  PasosDiarios,
  ProgramDay,
  ProgramExercise,
  ProgramExerciseDetail,
  ProgramWeek,
  RegistroCorporal,
  TracEntry,
} from "./types.js";

type Serie = ProgramExerciseDetail["sets"][number];
type Ejercicio = ProgramExercise & Pick<ProgramExerciseDetail, "rastrea_e1rm" | "sets"> & {
  nombre: string | null;
};
type Dia = Omit<ProgramDay, "notas"> & { notas_coach: string | null; exercises: Ejercicio[] };
type ContextoDia = NutricionDia & { registro_corporal: RegistroCorporal | null; trac: TracEntry | null };
type Rango = { desde: string; hasta: string };

function leerDias(db: Database.Database, weekId: number): Dia[] {
  const dias = (db.prepare(`
    SELECT pd.* FROM program_days pd WHERE pd.week_id = ? ORDER BY pd.orden, pd.dia, pd.id
  `).all(weekId) as ProgramDay[]).map(({ notas, ...dia }): Dia => ({
    ...dia, notas_coach: notas, exercises: [],
  }));
  const diasPorId = new Map(dias.map((dia) => [dia.id, dia]));
  const ejercicios = db.prepare(`
    SELECT pe.*, COALESCE(e.nombre, pe.nombre_libre) AS nombre,
           COALESCE(e.rastrea_e1rm, 0) AS rastrea_e1rm
    FROM program_exercises pe
    JOIN program_days pd ON pd.id = pe.day_id
    LEFT JOIN exercises e ON e.id = pe.exercise_id
    WHERE pd.week_id = ?
    ORDER BY pe.orden, pe.id
  `).all(weekId) as Omit<Ejercicio, "sets">[];
  const ejerciciosPorId = new Map<number, Ejercicio>();
  for (const fila of ejercicios) {
    const ejercicio: Ejercicio = { ...fila, sets: [] };
    diasPorId.get(ejercicio.day_id)?.exercises.push(ejercicio);
    ejerciciosPorId.set(ejercicio.id, ejercicio);
  }
  const series = db.prepare(`
    SELECT s.*
    FROM v_program_sets_e1rm s
    JOIN program_exercises pe ON pe.id = s.program_exercise_id
    JOIN program_days pd ON pd.id = pe.day_id
    WHERE pd.week_id = ?
    ORDER BY s.n_serie, s.id
  `).all(weekId) as Serie[];
  for (const serie of series) {
    ejerciciosPorId.get(serie.program_exercise_id)?.sets.push(serie);
  }
  return dias;
}

// El ADR deja abierto el inicio si no hay sesión previa. Se materializan fechas
// desde el primer dato disponible, incluyendo la creación o prescripción de la semana.
function inicioDelContexto(db: Database.Database, weekId: number, hasta: string): string {
  const { desde } = db.prepare(`
    SELECT COALESCE(MIN(fecha), @hasta) AS desde
    FROM (
      SELECT fecha_creada AS fecha FROM program_weeks WHERE id = @weekId
      UNION ALL SELECT objetivos_pautados_en FROM program_weeks WHERE id = @weekId
      UNION ALL SELECT MIN(fecha) FROM program_days WHERE week_id = @weekId
      UNION ALL SELECT MIN(fecha) FROM ingesta_diaria
      UNION ALL SELECT MIN(fecha) FROM pasos_diarios
      UNION ALL SELECT MIN(fecha) FROM registro_corporal
      UNION ALL SELECT MIN(fecha) FROM trac
    )
    WHERE fecha <= @hasta
  `).get({ weekId, hasta }) as { desde: string };
  return desde;
}

function porFecha<T extends { fecha: string }>(filas: T[]): Map<string, T> {
  return new Map(filas.map((fila) => [fila.fecha, fila]));
}

function leerContexto(db: Database.Database, rango: Rango, calendario: Calendario): ContextoDia[] {
  const fechas = db.prepare(`
    WITH RECURSIVE fechas(fecha) AS (
      SELECT @desde WHERE @desde <= @hasta
      UNION ALL
      SELECT date(fecha, '+1 day') FROM fechas WHERE fecha < @hasta
    )
    SELECT fecha FROM fechas ORDER BY fecha
  `).pluck().all(rango) as string[];
  const ingestas = porFecha(db.prepare(
    "SELECT * FROM ingesta_diaria WHERE fecha BETWEEN @desde AND @hasta"
  ).all(rango) as IngestaDiaria[]);
  const pasos = porFecha(db.prepare(
    "SELECT * FROM pasos_diarios WHERE fecha BETWEEN @desde AND @hasta"
  ).all(rango) as PasosDiarios[]);
  const registros = porFecha(db.prepare(
    "SELECT * FROM registro_corporal WHERE fecha BETWEEN @desde AND @hasta"
  ).all(rango) as RegistroCorporal[]);
  const trac = porFecha(db.prepare(
    "SELECT * FROM trac WHERE fecha BETWEEN @desde AND @hasta"
  ).all(rango) as TracEntry[]);

  return fechas.map((fecha) => ({
    fecha,
    objetivo: calendario.objetivoEn(fecha),
    ingesta: ingestas.get(fecha) ?? null,
    pasos: pasos.get(fecha) ?? null,
    registro_corporal: registros.get(fecha) ?? null,
    trac: trac.get(fecha) ?? null,
  }));
}

export function leerDevolucionSemanal(db: Database.Database, weekId: number) {
  const semana = db.prepare("SELECT * FROM program_weeks WHERE id = ?").get(weekId) as ProgramWeek | undefined;
  if (!semana) return null;

  const calendario = calendarioDesdeDb(db);
  const rango = calendario.rangoDe(weekId);
  const contexto = rango
    ? leerContexto(db, { ...rango, desde: rango.desde ?? inicioDelContexto(db, weekId, rango.hasta) }, calendario)
    : [];
  return {
    semana,
    rango,
    objetivo_nutricional: calendario.objetivoPautado(weekId),
    dias: leerDias(db, weekId),
    contexto,
  };
}
