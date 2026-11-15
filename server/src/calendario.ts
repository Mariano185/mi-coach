import type Database from "better-sqlite3";
import type { ObjetivoNutricional } from "./types.js";

// Único lugar que conoce las reglas del ADR 0003 ("dos relojes"): cómo se cruza el
// programa (semanas por id) con el calendario (fechas).
//
// - Rango de una semana: desde el día siguiente a la última sesión de la anterior hasta
//   su propia última sesión, o hasta hoy si es la última. Las semanas se ordenan por id.
// - Objetivo vigente en una fecha: el de la semana más reciente, desde la semana de esa
//   fecha hacia atrás, que tenga objetivo y cuyo objetivos_pautados_en sea ≤ la fecha.

/** Objetivo tal como lo pautó el coach en una semana (sin week_id: lo pone el calendario). */
export type ObjetivoDeSemana = Omit<ObjetivoNutricional, "week_id">;

export interface SemanaCalendario {
  id: number;
  /** Fechas (YYYY-MM-DD) de los días entrenados de la semana, en cualquier orden. */
  sesiones: string[];
  objetivo: ObjetivoDeSemana | null;
}

/** desde null = sin límite inferior (la primera semana se queda con todo lo anterior).
 *  Una semana intermedia sin sesiones no tiene rango (rangoDe devuelve null). */
export interface RangoSemana {
  desde: string | null;
  hasta: string;
}

export interface Calendario {
  rangoDe(weekId: number): RangoSemana | null;
  semanaDe(fecha: string): number | null;
  objetivoEn(fecha: string): ObjetivoNutricional | null;
}

function diaSiguiente(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function ultima(fechas: string[]): string | null {
  return fechas.reduce<string | null>((max, f) => (max === null || f > max ? f : max), null);
}

export function crearCalendario(semanasEntrada: SemanaCalendario[], hoy: string): Calendario {
  const semanas = [...semanasEntrada].sort((a, b) => a.id - b.id);

  // Rangos en orden. Una semana sin sesiones que no es la última no tiene fechas propias
  // (null): esas fechas ya son de la siguiente, que arranca el mismo día.
  const rangos: Array<RangoSemana | null> = [];
  let ultimaSesionPrevia: string | null = null;
  semanas.forEach((s, i) => {
    const desde = ultimaSesionPrevia === null ? null : diaSiguiente(ultimaSesionPrevia);
    const propia = ultima(s.sesiones);
    const esUltima = i === semanas.length - 1;
    const hasta = esUltima ? hoy : propia;
    rangos.push(hasta === null ? null : { desde, hasta });
    if (propia !== null && (ultimaSesionPrevia === null || propia > ultimaSesionPrevia)) {
      ultimaSesionPrevia = propia;
    }
  });

  // Índice de la semana de una fecha. La última semana también se queda con fechas
  // posteriores a hoy (no hay otra a la que asignarlas).
  function indiceDe(fecha: string): number {
    for (let i = semanas.length - 1; i >= 0; i--) {
      const rango = rangos[i];
      if (!rango) continue;
      const despuesDelInicio = rango.desde === null || fecha >= rango.desde;
      const antesDelFin = i === semanas.length - 1 || fecha <= rango.hasta;
      if (despuesDelInicio && antesDelFin) return i;
    }
    return -1;
  }

  return {
    rangoDe(weekId) {
      const i = semanas.findIndex((s) => s.id === weekId);
      return i === -1 ? null : rangos[i];
    },
    semanaDe(fecha) {
      const i = indiceDe(fecha);
      return i === -1 ? null : semanas[i].id;
    },
    objetivoEn(fecha) {
      for (let i = indiceDe(fecha); i >= 0; i--) {
        const obj = semanas[i].objetivo;
        if (obj && obj.pautado_en <= fecha) return { week_id: semanas[i].id, ...obj };
      }
      return null;
    },
  };
}

// Fecha LOCAL de hoy (mismo reloj que date('now','localtime') con que se autosetea la
// fecha de un día entrenado). No toISOString(): de noche en UTC−3 ya sería mañana.
export function hoyLocal(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

interface FilaSemana {
  id: number;
  sesiones: string | null;
  objetivo_kcal: number | null;
  objetivo_proteina_g: number | null;
  objetivo_carbohidratos_g: number | null;
  objetivo_grasas_g: number | null;
  nota_nutricional: string | null;
  objetivos_pautados_en: string | null;
}

/** Arma el calendario con todas las semanas de la DB. */
export function calendarioDesdeDb(db: Database.Database, hoy: string = hoyLocal()): Calendario {
  const filas = db
    .prepare(
      `SELECT pw.id,
              (SELECT GROUP_CONCAT(pd.fecha) FROM program_days pd
                 WHERE pd.week_id = pw.id AND pd.fecha IS NOT NULL) AS sesiones,
              pw.objetivo_kcal, pw.objetivo_proteina_g, pw.objetivo_carbohidratos_g,
              pw.objetivo_grasas_g, pw.nota_nutricional, pw.objetivos_pautados_en
         FROM program_weeks pw
        ORDER BY pw.id`
    )
    .all() as FilaSemana[];

  return crearCalendario(
    filas.map((f) => ({
      id: f.id,
      sesiones: f.sesiones ? f.sesiones.split(",") : [],
      objetivo:
        f.objetivo_kcal !== null && f.objetivos_pautados_en !== null
          ? {
              kcal: f.objetivo_kcal,
              proteina_g: f.objetivo_proteina_g!,
              carbohidratos_g: f.objetivo_carbohidratos_g!,
              grasas_g: f.objetivo_grasas_g!,
              nota: f.nota_nutricional,
              pautado_en: f.objetivos_pautados_en,
            }
          : null,
    })),
    hoy
  );
}
