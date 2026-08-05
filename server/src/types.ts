// Tipos del dominio compartidos por el backend.

export interface Exercise {
  id: number;
  nombre: string;
  categoria: string;
  es_basico: 0 | 1;
}

// === Enciclopedia de ejercicios (ver docs/adr/0001) ===
// Vocabularios controlados — documentados acá como referencia rápida del tipo
// (TEXT libre en la columna SQL), pero la fuente de verdad en RUNTIME es
// server/src/validacion/ejercicio.ts: POST/PATCH /api/exercises y el seed
// (validarCatalogo) los validan desde ahí, no confían en el tipo de TS.
//   implemento:         barra | mancuerna | polea | maquina | smith | peso_corporal | banda | kettlebell
//   tipo_variante:       angulo | agarre | postura | tempo | pausa | rom | resistencia_acomodada | implemento | unilateral
//   mecanica:            compuesto | aislamiento
//   fuerza:              empuje | traccion | estatico
//   sesgo_longitud:      alargado | medio | acortado   (criterio de desempate, no ley — ver ADR)
//   perfil_resistencia:  ascendente | descendente | campana | constante
//   cadena:              abierta | cerrada
//   rol (en EjercicioMusculo): agonista | sinergista | estabilizador

export interface Musculo {
  id: number;
  nombre: string;
  nombre_en: string | null;
  grupo: string;
  region: string | null;
  biarticular: 0 | 1;
  n_ejercicios: number;
}

export interface Patron {
  id: number;
  nombre: string;
  plano: string | null;
  descripcion: string | null;
  n_ejercicios: number;
}

// Fila de GET /api/exercises?musculo_id=X — forma compacta + el rol de ese
// ejercicio para el músculo filtrado.
export interface ExerciseConRol extends Exercise {
  rol: string;
  orden: number;
  fraccion_volumen: number;
}

export interface EjercicioMusculo {
  id: number;
  exercise_id: number;
  musculo_id: number;
  rol: string;
  orden: number;
  fraccion_volumen: number;
}

// Detalle completo de un ejercicio: identidad, biomecánica y su grilla muscular
// propia (cada variante lleva la suya, no la hereda del padre — ver ADR).
export interface ExerciseDetalle extends Exercise {
  patron_id: number | null;
  patron_nombre: string | null;
  ejercicio_padre_id: number | null;
  ejercicio_padre_nombre: string | null;
  tipo_variante: string | null;
  transferencia: number | null;
  proposito: string | null;
  implemento: string | null;
  angulo_grados: number | null;
  agarre: string | null;
  postura: string | null;
  unilateral: 0 | 1 | null;
  mecanica: string | null;
  fuerza: string | null;
  sesgo_longitud: string | null;
  perfil_resistencia: string | null;
  cadena: string | null;
  carga_axial: 0 | 1 | null;
  costo_fatiga: number | null;
  demanda_estabilidad: number | null;
  demanda_tecnica: number | null;
  rastrea_e1rm: 0 | 1 | null;
  es_competitivo: 0 | 1 | null;
  notas_tecnicas: string | null;
  contraindicaciones: string | null;
  cues: string | null;
  variantes: Array<{ id: number; nombre: string; tipo_variante: string | null }>;
  musculos: Array<{
    musculo_id: number;
    nombre: string;
    grupo: string;
    rol: string;
    orden: number;
    fraccion_volumen: number;
  }>;
}

// Grilla muscular de entrada: musculo_id (no slug) + rol + fraccion. El orden
// del array ES el `orden` de la tabla (1 = mayor contribución) — mismo
// contrato que MusculoRef en el seed, pero por id en vez de por slug.
export interface MusculoGridInput {
  musculo_id: number;
  rol: string;
  fraccion_volumen: number;
}

// POST /api/exercises — mismos campos obligatorios que un ejercicio curado a
// mano (ver SeedEjercicio): un ejercicio de la API es indistinguible en
// calidad de uno del catálogo curado. rastrea_e1rm/es_competitivo NO están acá
// a propósito: no son editables por API (ver validacion/ejercicio-db.ts).
export interface NewExerciseInput {
  nombre: string;
  categoria: string;
  patron_id: number;
  ejercicio_padre_id?: number | null;
  tipo_variante?: string | null;
  transferencia?: number | null;
  proposito?: string | null;
  implemento: string;
  angulo_grados?: number | null;
  agarre?: string | null;
  postura?: string | null;
  unilateral?: boolean;
  mecanica: string;
  fuerza: string;
  sesgo_longitud: string;
  perfil_resistencia?: string;
  cadena?: string;
  carga_axial?: boolean;
  costo_fatiga: number;
  demanda_estabilidad: number;
  demanda_tecnica: number;
  notas_tecnicas?: string | null;
  contraindicaciones?: string | null;
  cues?: string | null;
  musculos: MusculoGridInput[];
}

// PATCH /api/exercises/:id — todos opcionales (merge parcial: `undefined` no
// toca el campo, `null` explícito lo limpia). `musculos` ausente no toca la
// grilla; presente reemplaza la grilla entera (nunca un merge fila a fila).
export type UpdateExerciseInput = Partial<Omit<NewExerciseInput, "musculos">> & {
  musculos?: MusculoGridInput[];
};

// Vista v_volumen_por_musculo — reemplaza a WeeklyVolume/volumen_por_categoria
// una vez que ejercicio_musculos está poblada (fase 2). Una fila por (semana de
// programa, músculo); distingue lo prescrito de lo hecho.
export interface VolumenMusculo {
  /** ISO (%Y-%W) de la semana. NULL si todavía no se entrenó ningún día. No es
   *  clave: dos semanas de programa distintas pueden caer en la misma ISO. */
  semana: string | null;
  semana_programa: number; // se reinicia por mesociclo
  mesociclo_id: number | null;
  week_id: number; // clave real: desambigua semana 1 del meso 1 vs. semana 1 sin meso
  semana_creada: string;
  musculo_id: number;
  musculo: string;
  grupo: string;
  series_programadas: number;
  series_completadas: number;
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
  notas: string | null; // canal del coach (read-only para el atleta, se renderiza con CoachNotes)
  notas_atleta: string | null; // canal del atleta (textarea editable)
  fecha: string | null; // se autosetea al completar la primera serie; editable a mano
  hora_inicio: string | null;
  hora_fin: string | null;
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
  rir: number | null; // derivado en v_program_sets_e1rm: MAX(0, ROUND(10 - real_rpe))
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
    notas?: string | null; // notas del coach para el día (no confundir con la notas de semana, arriba)
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

// POST /program/days/:id/exercises/reorder — reasigna orden 0..n-1 según el array.
export interface ReorderExercisesInput {
  ids: number[];
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
  semana: string; // ISO week label (YYYY-WW)
  series_basicos: number;
  series_accesorios: number;
}

export interface Stats {
  basicos: BasicE1rm[];
  tendencia_peso: WeightTrendPoint[];
  volumen_semanal: WeeklyVolume[];
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

// === Coach (adherencia) ===
export interface AdherenciaPorPosicion {
  posicion: number;
  dias: number;
  series_programadas: number;
  series_completadas: number;
  pct: number;
}

export interface AdherenciaPorLargo extends AdherenciaPorPosicion {
  n_ejercicios_dia: number;
}

export interface AdherenciaPorEjercicio {
  nombre: string;
  dias: number;
  posicion_prom: number;
  series_programadas: number;
  series_completadas: number;
  pct: number;
}

export interface AdherenciaResponse {
  ventana_dias: number;
  dias_analizados: number;
  por_posicion: AdherenciaPorPosicion[];
  por_largo_de_dia: AdherenciaPorLargo[];
  por_ejercicio: AdherenciaPorEjercicio[];
}

// === Coach (progresion_basicos, bloque de /analisis) ===
// Una fila por combinación de carga (nombre, fecha, peso_kg, reps) — no por serie ni por
// sesión. Top set + back-off del mismo día quedan como filas separadas, cada una con su
// e1RM propio; rpe_min/rpe_max conservan la fatiga intra-sesión que un promedio borraría.
export interface ProgresionBasico {
  nombre: string;
  fecha: string;
  peso_kg: number;
  reps: number;
  e1rm: number;
  rpe_min: number | null;
  rpe_max: number | null;
  n_series: number;
}

// === Coach (GET /coach/progresion/:exercise_id) ===
// La historia de UN ejercicio de la library, sesión por sesión. A diferencia de
// ProgresionBasico (bloque de /analisis, limitado a rastrea_e1rm = 1 y con una fila
// por combinación de carga), este cubre CUALQUIER ejercicio y anida las series dentro
// de su sesión — la lista `sesiones` en orden ascendente ES la curva de progresión.

export interface ProgresionEjercicioSerie {
  day_id: number; // el program_day del que salió: dos days distintos pueden compartir sesión
  n_serie: number;
  peso_kg: number;
  reps: number;
  rpe: number | null;
  rir: number | null; // derivado en la vista: MAX(0, ROUND(10 - real_rpe))
  e1rm: number; // de v_program_sets_e1rm, nunca recalculado
  tonelaje: number; // idem: real_peso * real_reps
}

// Una sesión = un DÍA CALENDARIO de ese ejercicio. El mismo ejercicio prescrito dos
// veces en el mismo día se fusiona acá en una sola sesión (por eso day_ids es array).
export interface ProgresionEjercicioSesion {
  fecha: string; // YYYY-MM-DD. Nunca null: se filtran los días sin fecha.
  day_ids: number[]; // >1 elemento = hubo fusión de dos program_days
  n_series: number; // series completadas (hecha=1 con peso Y reps)
  /** Máximo e1RM de la sesión. OJO: mejor_e1rm y mejor_tonelaje son máximos
   *  INDEPENDIENTES — pueden venir de series distintas. No son "la mejor serie". */
  mejor_e1rm: number;
  mejor_tonelaje: number;
  tonelaje_total: number; // volumen real de la sesión (suma, no máximo)
  rpe_min: number | null; // null si ninguna serie registró RPE
  rpe_max: number | null;
  series: ProgresionEjercicioSerie[];
}

export interface ProgresionEjercicio {
  ventana_dias: number;
  ejercicio: {
    id: number;
    nombre: string;
    categoria: string;
    mecanica: string | null;
    implemento: string | null;
    patron: string | null;
    es_basico: 0 | 1;
    /** 1 = movimiento de competencia; su progresión YA está en progresion_basicos
     *  de /analisis. 0 = accesorio, que es el caso para el que existe este endpoint. */
    rastrea_e1rm: 0 | 1;
  };
  n_sesiones: number;
  /** Orden ASCENDENTE por fecha (la más vieja primero): se lee como una curva.
   *  Vacío = el ejercicio existe pero no se entrenó DENTRO DE LA VENTANA (no
   *  necesariamente "nunca") — subí ?dias para descartar lo segundo. */
  sesiones: ProgresionEjercicioSesion[];
}

// === Coach (dias_programados, bloque de /analisis) ===
export interface DiaProgramado {
  mesociclo_id: number | null;
  mesociclo_nombre: string | null;
  semana: number;
  dia: number;
  titulo: string | null;
  tipo: string | null;
  fecha: string | null; // null = programado, nunca empezado
  series_programadas: number;
  series_completadas: number;
}

// === Coach (docs) ===
// GET /coach/docs — la doc operativa del coach, servida desde el repo para que
// no pueda desincronizarse del código que describe.
export interface CoachDocsEndpoint {
  metodo: string;
  ruta: string;
}

export interface CoachDocsAnalisisBloque {
  bloque: string;
  opt_in: boolean;
}

export interface CoachDocsGenerado {
  endpoints: CoachDocsEndpoint[];
  analisis_bloques: CoachDocsAnalisisBloque[];
  version_deploy: string;
}

export interface CoachDocsSeccion {
  id: string;
  titulo: string;
  markdown: string;
}

export interface CoachDocsResponse {
  generado: CoachDocsGenerado;
  secciones: CoachDocsSeccion[];
}
