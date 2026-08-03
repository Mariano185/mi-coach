// Validaciones de ejercicio que necesitan la DB (a diferencia de ejercicio.ts,
// que es puro). Contraparte, para la API, de lo que el seed resuelve contra
// los arrays estáticos: nombre único, patrón/músculos existentes, linaje sin
// ciclos — acá contra las tablas reales, donde puede haber ejercicios que no
// están en el catálogo curado.

import { db } from "../db.js";
import { EJERCICIOS } from "../seed/ejercicios/index.js";

// Nombres del catálogo curado. seedEnciclopedia() corre en cada arranque y
// hace UPSERT + DELETE/INSERT de la grilla muscular SOLO para estos nombres
// (ver seed/index.ts) — un ejercicio de la API con uno de estos nombres se
// revertiría en el próximo restart. Se importa el array real (no una copia)
// para que la señal nunca pueda desincronizarse de lo que el seed va a hacer.
const NOMBRES_CURADOS = new Set(EJERCICIOS.map((e) => e.nombre));

export function esCurado(nombre: string): boolean {
  return NOMBRES_CURADOS.has(nombre);
}

/** (1) nombre único en la DB. `exceptoId` para que un PATCH que no cambia el
 *  nombre no colisione consigo mismo. */
export function nombreDuplicado(nombre: string, exceptoId?: number): boolean {
  const row =
    exceptoId === undefined
      ? db.prepare("SELECT 1 FROM exercises WHERE nombre = ?").get(nombre)
      : db.prepare("SELECT 1 FROM exercises WHERE nombre = ? AND id != ?").get(nombre, exceptoId);
  return row !== undefined;
}

/** (2) patron_id existe. */
export function patronExiste(id: number): boolean {
  return db.prepare("SELECT 1 FROM patrones WHERE id = ?").get(id) !== undefined;
}

/** (4) todos los musculo_id existen. Devuelve los que faltan (vacío = ok). */
export function musculosInexistentes(ids: number[]): number[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  const existentes = new Set(
    (db.prepare(`SELECT id FROM musculos WHERE id IN (${placeholders})`).all(...ids) as Array<{ id: number }>).map(
      (r) => r.id
    )
  );
  return ids.filter((id) => !existentes.has(id));
}

const CICLO_SQL = `
  WITH RECURSIVE ancestros(id) AS (
    SELECT @padre_id AS id
    UNION
    SELECT e.ejercicio_padre_id
      FROM exercises e
      JOIN ancestros a ON a.id = e.id
     WHERE e.ejercicio_padre_id IS NOT NULL
  )
  SELECT 1 FROM ancestros WHERE id = @hijo_id LIMIT 1
`;

/**
 * (12) el linaje: padre existe, no auto-padre, sin ciclos.
 * `hijoId` es null en POST (la fila no existe todavía: no puede ser su propio
 * ancestro, así que el chequeo de ciclo se saltea con seguridad). En PATCH es
 * el id de la fila que se está editando, para detectar reparenting circular
 * (incluso indirecto: A←B←C y PATCH A {padre: C}).
 * Devuelve el mensaje de error, o null si el linaje es válido.
 */
export function validarLinajeDb(hijoId: number | null, padreId: number | null): string | null {
  if (padreId === null) return null;
  if (!db.prepare("SELECT 1 FROM exercises WHERE id = ?").get(padreId)) {
    return `ejercicio_padre_id inexistente: ${padreId}`;
  }
  if (hijoId === null) return null;
  if (hijoId === padreId) return "un ejercicio no puede ser su propio padre";
  const ciclo = db.prepare(CICLO_SQL).get({ padre_id: padreId, hijo_id: hijoId });
  return ciclo ? "el linaje formaría un ciclo" : null;
}
