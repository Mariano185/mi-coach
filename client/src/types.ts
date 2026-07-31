// Tipos del dominio en el cliente (espejo del server).

export interface Exercise {
  id: number;
  nombre: string;
  categoria: string;
  es_basico: 0 | 1;
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

export interface ProgramDayCard {
  id: number;
  week_id: number;
  dia: number;
  tipo: string | null;
  titulo: string | null;
  warmup: string | null;
  fecha: string | null;
  orden: number;
  nombre_ejercicios: string | null;
  n_ejercicios: number;
  n_series: number;
  n_series_hechas: number;
}

export interface ProgramWeekDetail extends ProgramWeek {
  days: ProgramDayCard[];
}

export interface ProgramExerciseCard {
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
  nombre: string;
  es_basico: 0 | 1;
  n_series: number;
  n_series_hechas: number;
}

export interface ProgramDayDetail {
  id: number;
  week_id: number;
  dia: number;
  tipo: string | null;
  titulo: string | null;
  warmup: string | null;
  notas: string | null;
  fecha: string | null; // se autosetea al completar la primera serie; editable a mano
  hora_inicio: string | null;
  hora_fin: string | null;
  orden: number;
  semana: number;
  nombre_semana: string | null;
  exercises: ProgramExerciseCard[];
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
  e1rm: number | null;
  tonelaje: number | null;
  rir: number | null;
}

export interface UpdateProgramSetTargetInput {
  target_reps?: number | null;
  target_rpe?: number | null;
  target_peso?: number | null;
}

export interface ProgramExerciseDetail {
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
  nombre: string;
  es_basico: 0 | 1;
  dia: number;
  tipo: string | null;
  sets: ProgramSet[];
}

export interface UpdateProgramSetInput {
  real_peso?: number | null;
  real_reps?: number | null;
  real_rpe?: number | null;
  hecha?: boolean;
  notas?: string | null;
}

export interface BasicE1rm {
  exercise_id: number;
  nombre: string;
  mejor_e1rm: number | null;   // PR histórico. null = nunca tuvo una serie con peso+reps
  mejor_fecha: string | null;  // YYYY-MM-DD del día del PR
  actual_e1rm: number | null;  // mejor de las últimas sesiones de ESE básico
  ultima_fecha: string | null; // último día entrenado
}

export interface WeightTrendPoint {
  fecha: string;
  peso_kg: number;
  promedio_movil_7d: number;
}

export interface WeeklyVolume {
  semana: string;
  series_basicos: number;
  series_accesorios: number;
}

export interface Stats {
  basicos: BasicE1rm[];
  tendencia_peso: WeightTrendPoint[];
  volumen_semanal: WeeklyVolume[];
}

// Inputs de formularios
export interface NewBodyweightInput {
  fecha: string;
  peso_kg: number;
  kcal_objetivo: number | null;
  proteina_g: number | null;
  hambre: number | null;
  digestion: string | null;
  notas: string | null;
}

// === Trac: tracker diario de bienestar/recuperación (independiente de sessions) ===
export interface TracEntry {
  id: number;
  fecha: string;
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

// === Historial (reemplaza sessions/sets — lee directo de program_sets) ===
export interface HistoryDay {
  day_id: number;
  fecha: string;
  semana: number;
  dia: number;
  tipo: string | null;
  titulo: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  n_series: number;
}

export interface HistoryDayDetail extends HistoryDay {
  sets: Array<{
    exercise_id: number | null;
    exercise_nombre: string;
    n_serie: number;
    real_peso: number;
    real_reps: number;
    real_rpe: number | null;
    rir: number | null;
    e1rm: number | null;
  }>;
}
