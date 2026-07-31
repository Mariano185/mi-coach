// Tipos del dominio compartidos por el backend.

export interface Exercise {
  id: number;
  nombre: string;
  categoria: string;
  es_basico: 0 | 1;
}

export interface SessionSet {
  id: number;
  session_id: number;
  exercise_id: number;
  n_serie: number;
  peso_kg: number;
  reps: number;
  rpe: number | null;
  rir: number | null;
  notas: string | null;
}

export interface Session {
  id: number;
  fecha: string; // YYYY-MM-DD
  tipo: string | null;
  comentarios: string | null;
}

export interface SessionWithSets extends Session {
  sets: Array<SessionSet & { exercise_nombre: string; e1rm: number }>;
}

export interface Bodyweight {
  id: number;
  fecha: string;
  peso_kg: number;
  kcal_objetivo: number | null;
  proteina_g: number | null;
  hambre: number | null;
  digestion: string | null;
  notas: string | null;
}

export interface NewBodyweightInput {
  fecha: string;
  peso_kg: number;
  kcal_objetivo?: number | null;
  proteina_g?: number | null;
  hambre?: number | null;
  digestion?: string | null;
  notas?: string | null;
}

// === Mesociclos: agrupador de semanas ===
export interface Mesociclo {
  id: number;
  nombre: string;
  objetivo: string | null;
  notas: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  orden: number;
  fecha_creada: string;
}

export interface MesocicloConSemanas extends Mesociclo {
  n_semanas: number;
}

export interface NewMesocicloInput {
  nombre: string;
  objetivo?: string | null;
  notas?: string | null;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
}

export interface UpdateMesocicloInput {
  nombre?: string;
  objetivo?: string | null;
  notas?: string | null;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  orden?: number;
}

// === Programa estructurado ===
export type Seccion = "main" | "accesorio" | "core";

export interface ProgramWeek {
  id: number;
  semana: number;
  nombre: string | null;
  bloque: string | null;
  notas: string | null;
  fecha_creada: string;
  activa: number;
  mesociclo_id: number | null;
}

export interface ProgramDay {
  id: number;
  week_id: number;
  dia: number;
  tipo: string | null;
  titulo: string | null;
  warmup: string | null;
  notas: string | null;
  fecha_plan: string | null;
  fecha_real: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  session_id: number | null;
  orden: number;
}

export interface ProgramExercise {
  id: number;
  day_id: number;
  exercise_id: number | null;
  nombre_libre: string | null;
  seccion: Seccion;
  reps_text: string | null;
  carga_text: string | null;
  rpe_text: string | null;
  notas: string | null;
  orden: number;
}

export interface ProgramSet {
  id: number;
  program_exercise_id: number;
  n_serie: number;
  target_reps: number | null;
  target_rpe: number | null;
  target_peso: number | null;
  real_peso: number | null;
  real_reps: number | null;
  real_rpe: number | null;
  hecha: number;
  notas: string | null;
}

// Vistas agregadas devueltas por la API:
export interface ProgramDayCard extends ProgramDay {
  nombre_ejercicios: string; // "Squat + Bench"
  n_ejercicios: number;
  n_series: number;
  n_series_hechas: number;
}

export interface ProgramWeekDetail extends ProgramWeek {
  days: ProgramDayCard[];
}

export interface ProgramExerciseCard extends ProgramExercise {
  nombre: string;     // exercise.nombre o nombre_libre
  es_basico: 0 | 1;
  n_series: number;
  n_series_hechas: number;
}

export interface ProgramDayDetail extends ProgramDay {
  nombre_semana: string | null;
  semana: number;
  exercises: ProgramExerciseCard[];
}

export interface ProgramExerciseDetail extends ProgramExercise {
  nombre: string;
  es_basico: 0 | 1;
  dia: number;
  tipo: string | null;
  sets: Array<ProgramSet & { e1rm: number | null; tonelaje: number | null }>;
}

// Inputs
export interface UpdateProgramSetInput {
  real_peso?: number | null;
  real_reps?: number | null;
  real_rpe?: number | null;
  hecha?: boolean;
  notas?: string | null;
}

export interface NewProgramWeekInput {
  semana: number;
  nombre?: string | null;
  bloque?: string | null;
  notas?: string | null;
  mesociclo_id?: number | null;
  days: Array<{
    dia: number;
    tipo?: string | null;
    titulo?: string | null;
    warmup?: string | null;
    fecha_plan?: string | null;
    exercises: Array<{
      exercise_id?: number | null;
      nombre_libre?: string | null;
      seccion?: Seccion;
      reps_text?: string | null;
      carga_text?: string | null;
      rpe_text?: string | null;
      notas?: string | null;
      sets: Array<{
        n_serie: number;
        target_reps?: number | null;
        target_rpe?: number | null;
        target_peso?: number | null;
      }>;
    }>;
  }>;
}

// PATCH /program/sets/:id/target — el coach corrige la prescripción de una serie ya creada.
export interface UpdateProgramSetTargetInput {
  target_reps?: number | null;
  target_rpe?: number | null;
  target_peso?: number | null;
}

// === Trac: tracker diario de bienestar/recuperación (independiente de sessions) ===
export interface TracEntry {
  id: number;
  fecha: string; // YYYY-MM-DD
  fatiga_pierna: number | null;
  fatiga_empuje: number | null;
  fatiga_traccion: number | null;
  descanso_alimentacion: number | null;
  recuperacion: number | null;
  motivacion: number | null;
  tecnica: number | null;
  creado_en: string;
  actualizado_en: string;
}

export interface UpsertTracInput {
  fecha: string;
  fatiga_pierna?: number | null;
  fatiga_empuje?: number | null;
  fatiga_traccion?: number | null;
  descanso_alimentacion?: number | null;
  recuperacion?: number | null;
  motivacion?: number | null;
  tecnica?: number | null;
}

// Respuesta de /api/stats
export interface BasicE1rm {
  exercise_id: number;
  nombre: string;
  mejor_e1rm: number;
  rm_inicial: number | null;
}

export interface WeightTrendPoint {
  fecha: string;
  peso_kg: number;
  promedio_movil_7d: number;
}

export interface WeeklyVolume {
  semana: string; // ISO week label (YYYY-WW)
  series_basicos: number;
  series_accesorios: number;
}

export interface Stats {
  basicos: BasicE1rm[];
  tendencia_peso: WeightTrendPoint[];
  volumen_semanal: WeeklyVolume[];
}
