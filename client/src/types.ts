// Tipos del dominio en el cliente (espejo del server).

export type SessionType = "A" | "B";

export interface Exercise {
  id: number;
  nombre: string;
  categoria: string;
  es_basico: 0 | 1;
}

export interface Session {
  id: number;
  fecha: string;
  tipo: SessionType;
  energia: number | null;
  sueno_horas: number | null;
  motivacion: number | null;
  dolor_molestias: string | null;
  comentarios: string | null;
}

export interface SetWithExercise {
  id: number;
  session_id: number;
  exercise_id: number;
  n_serie: number;
  peso_kg: number;
  reps: number;
  rpe: number | null;
  rir: number | null;
  notas: string | null;
  exercise_nombre: string;
  e1rm: number;
}

export interface SessionWithSets extends Session {
  sets: SetWithExercise[];
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

export interface ProgramSummary {
  id: number;
  semana: number;
  fecha_creada: string;
  resumen: string | null;
}

export interface Program extends ProgramSummary {
  contenido_md: string;
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
}

export interface ProgramDayCard {
  id: number;
  week_id: number;
  dia: number;
  tipo: SessionType | null;
  titulo: string | null;
  warmup: string | null;
  fecha_plan: string | null;
  session_id: number | null;
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
  tipo: SessionType | null;
  titulo: string | null;
  warmup: string | null;
  notas: string | null;
  fecha_plan: string | null;
  fecha_real: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  session_id: number | null;
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
  real_peso: number | null;
  real_reps: number | null;
  real_rpe: number | null;
  hecha: number;
  notas: string | null;
  e1rm: number | null;
  tonelaje: number | null;
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
  tipo: SessionType | null;
  sets: ProgramSet[];
}

export interface UpdateProgramSetInput {
  real_peso?: number | null;
  real_reps?: number | null;
  real_rpe?: number | null;
  hecha?: boolean;
  notas?: string | null;
}

export interface CompleteDayInput {
  fecha?: string;
  energia?: number | null;
  sueno_horas?: number | null;
  motivacion?: number | null;
  dolor_molestias?: string | null;
  comentarios?: string | null;
}

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
export interface NewSetInput {
  exercise_id: number;
  n_serie: number;
  peso_kg: number;
  reps: number;
  rpe: number | null;
  rir: number | null;
  notas: string | null;
}

export interface NewSessionInput {
  fecha: string;
  tipo: SessionType;
  energia: number | null;
  sueno_horas: number | null;
  motivacion: number | null;
  dolor_molestias: string | null;
  comentarios: string | null;
  sets: NewSetInput[];
}

export interface NewBodyweightInput {
  fecha: string;
  peso_kg: number;
  kcal_objetivo: number | null;
  proteina_g: number | null;
  hambre: number | null;
  digestion: string | null;
  notas: string | null;
}
