// Seed de la enciclopedia de ejercicios (ver docs/adr/0001).
//
// Se llama desde initDb() en cada arranque, así que una DB recién creada al
// clonar el repo nace con el catálogo completo — sin paso manual.
//
// IDEMPOTENCIA: no alcanza con "insertar si la tabla está vacía" (el criterio
// del viejo seedExercises). Las DBs ya desplegadas tienen filas con historial de
// entrenamiento colgando de sus ids, así que el seed hace UPSERT POR NOMBRE:
//   - si el nombre ya existe  -> UPDATE de las columnas de la enciclopedia,
//                                conservando id, categoria y es_basico
//   - si no existe            -> INSERT
// Nunca borra ejercicios. Un ejercicio que el usuario agregó a mano y que no
// está en el catálogo simplemente se deja intacto.

import type { Database } from "better-sqlite3";
import { MUSCULOS } from "./musculos.js";
import { PATRONES } from "./patrones.js";
import { EJERCICIOS, validarCatalogo } from "./ejercicios/index.js";
import { ROL_LARGO, DEFAULTS_EJERCICIO, type SeedEjercicio } from "./ejercicios/tipos.js";

const bool = (v: boolean | undefined, def: boolean): 0 | 1 => ((v ?? def) ? 1 : 0);

export function seedEnciclopedia(db: Database): void {
  // Falla ruidosamente si el catálogo escrito a mano tiene un slug inválido,
  // un padre inexistente o un ciclo. Mejor no arrancar que arrancar con datos
  // silenciosamente incompletos sobre los que el coach va a decidir.
  validarCatalogo();

  const tx = db.transaction(() => {
    const musculoIds = seedMusculos(db);
    const patronIds = seedPatrones(db);
    const ejercicioIds = seedEjercicios(db, patronIds);
    seedLinaje(db, ejercicioIds);
    seedEjercicioMusculos(db, ejercicioIds, musculoIds);
  });
  tx();
}

// --- Catálogos ---

function seedMusculos(db: Database): Map<string, number> {
  const insert = db.prepare(
    `INSERT INTO musculos (nombre, nombre_en, grupo, region, biarticular)
     VALUES (@nombre, @nombre_en, @grupo, @region, @biarticular)
     ON CONFLICT(nombre) DO UPDATE SET
       nombre_en = excluded.nombre_en,
       grupo = excluded.grupo,
       region = excluded.region,
       biarticular = excluded.biarticular`
  );
  const selectId = db.prepare("SELECT id FROM musculos WHERE nombre = ?");

  const ids = new Map<string, number>();
  for (const m of MUSCULOS) {
    insert.run({
      nombre: m.nombre,
      nombre_en: m.nombre_en,
      grupo: m.grupo,
      region: m.region,
      biarticular: m.biarticular,
    });
    ids.set(m.slug, (selectId.get(m.nombre) as { id: number }).id);
  }
  return ids;
}

function seedPatrones(db: Database): Map<string, number> {
  const insert = db.prepare(
    `INSERT INTO patrones (nombre, plano, descripcion)
     VALUES (@nombre, @plano, @descripcion)
     ON CONFLICT(nombre) DO UPDATE SET
       plano = excluded.plano,
       descripcion = excluded.descripcion`
  );
  const selectId = db.prepare("SELECT id FROM patrones WHERE nombre = ?");

  const ids = new Map<string, number>();
  for (const p of PATRONES) {
    insert.run({ nombre: p.nombre, plano: p.plano, descripcion: p.descripcion });
    ids.set(p.slug, (selectId.get(p.nombre) as { id: number }).id);
  }
  return ids;
}

// --- Ejercicios ---

/**
 * Columnas de la enciclopedia. `categoria` y `es_basico` quedan fuera del UPDATE
 * a propósito: son las columnas legacy que se retiran en el cutover, y pisarlas
 * acá cambiaría el comportamiento de stats/coach antes de tiempo.
 */
function seedEjercicios(db: Database, patronIds: Map<string, number>): Map<string, number> {
  const insert = db.prepare(
    `INSERT INTO exercises (
       nombre, categoria, es_basico,
       patron_id, tipo_variante, transferencia, proposito,
       implemento, angulo_grados, agarre, postura, unilateral,
       mecanica, fuerza, sesgo_longitud, perfil_resistencia, cadena, carga_axial,
       costo_fatiga, demanda_estabilidad, demanda_tecnica,
       rastrea_e1rm, es_competitivo,
       notas_tecnicas, contraindicaciones, cues
     ) VALUES (
       @nombre, @categoria, @es_basico,
       @patron_id, @tipo_variante, @transferencia, @proposito,
       @implemento, @angulo_grados, @agarre, @postura, @unilateral,
       @mecanica, @fuerza, @sesgo_longitud, @perfil_resistencia, @cadena, @carga_axial,
       @costo_fatiga, @demanda_estabilidad, @demanda_tecnica,
       @rastrea_e1rm, @es_competitivo,
       @notas_tecnicas, @contraindicaciones, @cues
     )
     ON CONFLICT(nombre) DO UPDATE SET
       patron_id = excluded.patron_id,
       tipo_variante = excluded.tipo_variante,
       transferencia = excluded.transferencia,
       proposito = excluded.proposito,
       implemento = excluded.implemento,
       angulo_grados = excluded.angulo_grados,
       agarre = excluded.agarre,
       postura = excluded.postura,
       unilateral = excluded.unilateral,
       mecanica = excluded.mecanica,
       fuerza = excluded.fuerza,
       sesgo_longitud = excluded.sesgo_longitud,
       perfil_resistencia = excluded.perfil_resistencia,
       cadena = excluded.cadena,
       carga_axial = excluded.carga_axial,
       costo_fatiga = excluded.costo_fatiga,
       demanda_estabilidad = excluded.demanda_estabilidad,
       demanda_tecnica = excluded.demanda_tecnica,
       rastrea_e1rm = excluded.rastrea_e1rm,
       es_competitivo = excluded.es_competitivo,
       notas_tecnicas = excluded.notas_tecnicas,
       contraindicaciones = excluded.contraindicaciones,
       cues = excluded.cues`
  );
  const selectId = db.prepare("SELECT id FROM exercises WHERE nombre = ?");

  const ids = new Map<string, number>();
  for (const ej of EJERCICIOS) {
    insert.run(paramsDe(ej, patronIds));
    ids.set(ej.nombre, (selectId.get(ej.nombre) as { id: number }).id);
  }
  return ids;
}

function paramsDe(ej: SeedEjercicio, patronIds: Map<string, number>) {
  return {
    nombre: ej.nombre,
    categoria: ej.categoria,
    // Solo relevante en INSERT (una fila nueva): en UPDATE no se toca.
    // Se deriva de rastrea_e1rm para que una DB nueva nazca coherente con la
    // semántica vieja de es_basico (= los 3 movimientos con seguimiento de e1RM).
    es_basico: bool(ej.rastrea_e1rm, DEFAULTS_EJERCICIO.rastrea_e1rm),
    patron_id: patronIds.get(ej.patron) ?? null,
    tipo_variante: ej.tipo_variante ?? null,
    transferencia: ej.transferencia ?? null,
    proposito: ej.proposito ?? null,
    implemento: ej.implemento,
    angulo_grados: ej.angulo_grados ?? null,
    agarre: ej.agarre ?? null,
    postura: ej.postura ?? null,
    unilateral: bool(ej.unilateral, DEFAULTS_EJERCICIO.unilateral),
    mecanica: ej.mecanica,
    fuerza: ej.fuerza,
    sesgo_longitud: ej.sesgo_longitud,
    perfil_resistencia: ej.perfil_resistencia ?? DEFAULTS_EJERCICIO.perfil_resistencia,
    cadena: ej.cadena ?? DEFAULTS_EJERCICIO.cadena,
    carga_axial: bool(ej.carga_axial, DEFAULTS_EJERCICIO.carga_axial),
    costo_fatiga: ej.costo_fatiga,
    demanda_estabilidad: ej.demanda_estabilidad,
    demanda_tecnica: ej.demanda_tecnica,
    rastrea_e1rm: bool(ej.rastrea_e1rm, DEFAULTS_EJERCICIO.rastrea_e1rm),
    es_competitivo: bool(ej.es_competitivo, DEFAULTS_EJERCICIO.es_competitivo),
    notas_tecnicas: ej.notas_tecnicas ?? null,
    contraindicaciones: ej.contraindicaciones ?? null,
    cues: ej.cues ?? null,
  };
}

/**
 * El linaje va en una segunda pasada porque una variante puede aparecer en el
 * catálogo antes que su padre, y el FK necesita que el padre ya tenga id.
 */
function seedLinaje(db: Database, ejercicioIds: Map<string, number>): void {
  const update = db.prepare("UPDATE exercises SET ejercicio_padre_id = ? WHERE id = ?");
  for (const ej of EJERCICIOS) {
    const id = ejercicioIds.get(ej.nombre);
    if (id === undefined) continue;
    update.run(ej.padre ? ejercicioIds.get(ej.padre) ?? null : null, id);
  }
}

/**
 * La grilla muscular se reconstruye entera por ejercicio (DELETE + INSERT) en
 * vez de hacer upsert fila a fila: así, si una revisión del catálogo saca un
 * músculo de un ejercicio, ese vínculo desaparece de verdad en lugar de quedar
 * huérfano inflando el volumen de ese músculo.
 */
function seedEjercicioMusculos(
  db: Database,
  ejercicioIds: Map<string, number>,
  musculoIds: Map<string, number>
): void {
  const borrar = db.prepare("DELETE FROM ejercicio_musculos WHERE exercise_id = ?");
  const insert = db.prepare(
    `INSERT INTO ejercicio_musculos (exercise_id, musculo_id, rol, orden, fraccion_volumen)
     VALUES (?, ?, ?, ?, ?)`
  );

  for (const ej of EJERCICIOS) {
    const exerciseId = ejercicioIds.get(ej.nombre);
    if (exerciseId === undefined) continue;

    borrar.run(exerciseId);
    ej.musculos.forEach(([slug, rol, fraccion], i) => {
      const musculoId = musculoIds.get(slug);
      if (musculoId === undefined) return; // validarCatalogo() ya lo habría cazado
      insert.run(exerciseId, musculoId, ROL_LARGO[rol], i + 1, fraccion);
    });
  }
}
