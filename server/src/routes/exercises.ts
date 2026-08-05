import { Router } from "express";
import { db } from "../db.js";
import type { Exercise, ExerciseConRol, ExerciseDetalle, MusculoGridInput, NewExerciseInput } from "../types.js";
import {
  validarEjercicio,
  type EjercicioNormalizado,
  type MusculoNormalizado,
} from "../validacion/ejercicio.js";
import { esCurado, musculosInexistentes, nombreDuplicado, patronExiste, validarLinajeDb } from "../validacion/ejercicio-db.js";

export const exercisesRouter = Router();

const DETALLE_COLS = `
  e.*,
  p.nombre AS patron_nombre,
  padre.nombre AS ejercicio_padre_nombre
`;

const ROLES = ["agonista", "sinergista", "estabilizador"] as const;

// GET /api/exercises — catálogo. Por default, forma compacta (no romper al cliente
// actual). ?detalle=full trae todas las columnas de la enciclopedia + músculos +
// variantes por ejercicio, para el coach. ?musculo_id=X[&rol=agonista] filtra a
// los ejercicios que trabajan ese músculo (filtro inverso: "qué entrena el glúteo
// medio"), ordenados por orden (los que más lo trabajan primero).
exercisesRouter.get("/", (req, res) => {
  if (req.query.musculo_id !== undefined) {
    const musculoId = Number(req.query.musculo_id);
    if (!Number.isInteger(musculoId)) {
      return res.status(400).json({ error: "musculo_id inválido" });
    }
    const rol = req.query.rol;
    if (rol !== undefined && !ROLES.includes(rol as (typeof ROLES)[number])) {
      return res.status(400).json({ error: `rol debe ser uno de: ${ROLES.join(", ")}` });
    }

    const rows = db
      .prepare(
        `SELECT e.id, e.nombre, e.categoria, e.rastrea_e1rm,
                em.rol, em.orden, em.fraccion_volumen
         FROM exercises e
         JOIN ejercicio_musculos em ON em.exercise_id = e.id
         WHERE em.musculo_id = @musculo_id
           AND (@rol IS NULL OR em.rol = @rol)
         ORDER BY em.orden`
      )
      .all({ musculo_id: musculoId, rol: rol ?? null }) as ExerciseConRol[];

    return res.json(rows);
  }

  if (req.query.detalle !== "full") {
    const rows = db
      .prepare("SELECT id, nombre, categoria, rastrea_e1rm FROM exercises ORDER BY rastrea_e1rm DESC, categoria, nombre")
      .all() as Exercise[];
    return res.json(rows);
  }

  const rows = db
    .prepare(
      `SELECT ${DETALLE_COLS}
       FROM exercises e
       LEFT JOIN patrones p ON p.id = e.patron_id
       LEFT JOIN exercises padre ON padre.id = e.ejercicio_padre_id
       ORDER BY e.rastrea_e1rm DESC, e.categoria, e.nombre`
    )
    .all() as Array<Omit<ExerciseDetalle, "variantes" | "musculos">>;

  const detalle = rows.map((r) => attachMusculosYVariantes(r));
  res.json(detalle);
});

// GET /api/exercises/:id — un ejercicio con su biomecánica, variantes y grilla
// muscular completa (cada variante lleva la suya, no la hereda del padre).
exercisesRouter.get("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  const row = db
    .prepare(
      `SELECT ${DETALLE_COLS}
       FROM exercises e
       LEFT JOIN patrones p ON p.id = e.patron_id
       LEFT JOIN exercises padre ON padre.id = e.ejercicio_padre_id
       WHERE e.id = ?`
    )
    .get(id) as Omit<ExerciseDetalle, "variantes" | "musculos"> | undefined;
  if (!row) return res.status(404).json({ error: "ejercicio no encontrado" });

  res.json(attachMusculosYVariantes(row));
});

function attachMusculosYVariantes(
  row: Omit<ExerciseDetalle, "variantes" | "musculos">
): ExerciseDetalle {
  const variantes = db
    .prepare("SELECT id, nombre, tipo_variante FROM exercises WHERE ejercicio_padre_id = ? ORDER BY nombre")
    .all(row.id) as ExerciseDetalle["variantes"];

  const musculos = db
    .prepare(
      `SELECT em.musculo_id, m.nombre, m.grupo, em.rol, em.orden, em.fraccion_volumen
       FROM ejercicio_musculos em
       JOIN musculos m ON m.id = em.musculo_id
       WHERE em.exercise_id = ?
       ORDER BY em.orden`
    )
    .all(row.id) as ExerciseDetalle["musculos"];

  return { ...row, variantes, musculos };
}

// Campos server-controlled: nunca vienen del cliente. rastrea_e1rm marca los 3
// movimientos de competencia (stats.ts/coach.ts filtran sobre él); si el coach
// pudiera setearlo, un accesorio contaminaría el panel de e1RM. es_competitivo
// es análogo. 400 explícito si vienen en el body — ignorarlos en silencio haría
// que un agente reintente sin entender por qué no tuvo efecto.
const CAMPOS_SERVER_CONTROLLED = ["rastrea_e1rm", "es_competitivo"] as const;

function rechazarCamposServerControlled(body: Record<string, unknown>): string | null {
  for (const campo of CAMPOS_SERVER_CONTROLLED) {
    if (body[campo] !== undefined) return `${campo} no es editable por la API`;
  }
  return null;
}

/** body.musculos (musculo_id) → MusculoNormalizado (clave = musculo_id), para
 *  pasarle al validador compartido con el seed (que usa slugs como clave). */
function normalizarGrilla(musculos: MusculoGridInput[]): MusculoNormalizado[] {
  return musculos.map((m) => ({ clave: m.musculo_id, rol: m.rol, fraccion: m.fraccion_volumen }));
}

type CamposNormalizables = {
  tipo_variante?: string | null;
  transferencia?: number | null;
  proposito?: string | null;
  implemento?: string | null;
  mecanica?: string | null;
  fuerza?: string | null;
  sesgo_longitud?: string | null;
  perfil_resistencia?: string | null;
  cadena?: string | null;
  costo_fatiga?: number | null;
  demanda_estabilidad?: number | null;
  demanda_tecnica?: number | null;
};

function aEjercicioNormalizado(
  nombre: string,
  patron_id: number | null,
  ejercicio_padre_id: number | null,
  campos: CamposNormalizables,
  musculos: MusculoGridInput[]
): EjercicioNormalizado {
  return {
    nombre,
    patron: patron_id,
    padre: ejercicio_padre_id,
    tipo_variante: campos.tipo_variante ?? null,
    transferencia: campos.transferencia ?? null,
    proposito: campos.proposito ?? null,
    implemento: campos.implemento ?? null,
    mecanica: campos.mecanica ?? null,
    fuerza: campos.fuerza ?? null,
    sesgo_longitud: campos.sesgo_longitud ?? null,
    perfil_resistencia: campos.perfil_resistencia ?? null,
    cadena: campos.cadena ?? null,
    costo_fatiga: campos.costo_fatiga ?? null,
    demanda_estabilidad: campos.demanda_estabilidad ?? null,
    demanda_tecnica: campos.demanda_tecnica ?? null,
    musculos: normalizarGrilla(musculos),
  };
}

const DEFAULTS = {
  unilateral: false,
  cadena: "abierta",
  carga_axial: false,
  perfil_resistencia: "campana",
};

// POST /api/exercises — alta enriquecida: mismos campos obligatorios que un
// ejercicio curado a mano en el seed (ver SeedEjercicio), porque un ejercicio
// de la API tiene que ser indistinguible en calidad de uno del catálogo
// curado. La grilla muscular viaja anidada (no hay endpoint propio para
// ejercicio_musculos): sus invariantes (≥1 agonista, etc.) solo tienen sentido
// evaluadas sobre la grilla completa, atómicamente, ver docs/adr/0001.
exercisesRouter.post("/", (req, res) => {
  const body = (req.body ?? {}) as Partial<NewExerciseInput>;

  const rechazado = rechazarCamposServerControlled(body as Record<string, unknown>);
  if (rechazado) return res.status(400).json({ error: rechazado });

  const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
  const categoria = typeof body.categoria === "string" ? body.categoria.trim() : "";
  if (!nombre) return res.status(400).json({ error: "nombre requerido" });
  if (!categoria) return res.status(400).json({ error: "categoria requerida" });
  if (typeof body.patron_id !== "number") return res.status(400).json({ error: "patron_id requerido" });
  if (!Array.isArray(body.musculos)) return res.status(400).json({ error: "musculos debe ser un array" });

  const musculos = body.musculos as MusculoGridInput[];
  const ejercicio_padre_id = body.ejercicio_padre_id ?? null;

  const normalizado = aEjercicioNormalizado(nombre, body.patron_id, ejercicio_padre_id, body, musculos);
  const errores = validarEjercicio(normalizado);
  if (errores.length > 0) return res.status(400).json({ error: errores[0] });

  if (esCurado(nombre)) {
    return res.status(409).json({
      error: `"${nombre}" está en el catálogo curado: el seed lo sobreescribiría en el próximo arranque. usá otro nombre o editá el catálogo en el código`,
    });
  }
  if (nombreDuplicado(nombre)) {
    return res.status(409).json({ error: `ya existe un ejercicio "${nombre}"` });
  }
  if (!patronExiste(body.patron_id)) {
    return res.status(400).json({ error: `patron_id inválido: ${body.patron_id}` });
  }
  const faltantes = musculosInexistentes(musculos.map((m) => m.musculo_id));
  if (faltantes.length > 0) {
    return res.status(400).json({ error: `musculo_id inexistente: ${faltantes[0]}` });
  }
  const errorLinaje = validarLinajeDb(null, ejercicio_padre_id);
  if (errorLinaje) return res.status(400).json({ error: errorLinaje });

  const insEx = db.prepare(
    `INSERT INTO exercises (
       nombre, categoria,
       patron_id, ejercicio_padre_id, tipo_variante, transferencia, proposito,
       implemento, angulo_grados, agarre, postura, unilateral,
       mecanica, fuerza, sesgo_longitud, perfil_resistencia, cadena, carga_axial,
       costo_fatiga, demanda_estabilidad, demanda_tecnica,
       rastrea_e1rm, es_competitivo,
       notas_tecnicas, contraindicaciones, cues
     ) VALUES (
       @nombre, @categoria,
       @patron_id, @ejercicio_padre_id, @tipo_variante, @transferencia, @proposito,
       @implemento, @angulo_grados, @agarre, @postura, @unilateral,
       @mecanica, @fuerza, @sesgo_longitud, @perfil_resistencia, @cadena, @carga_axial,
       @costo_fatiga, @demanda_estabilidad, @demanda_tecnica,
       0, 0,
       @notas_tecnicas, @contraindicaciones, @cues
     )`
  );
  const insMus = db.prepare(
    `INSERT INTO ejercicio_musculos (exercise_id, musculo_id, rol, orden, fraccion_volumen)
     VALUES (?, ?, ?, ?, ?)`
  );

  const params = {
    nombre,
    categoria,
    patron_id: body.patron_id,
    ejercicio_padre_id,
    tipo_variante: body.tipo_variante ?? null,
    transferencia: body.transferencia ?? null,
    proposito: body.proposito ?? null,
    implemento: body.implemento,
    angulo_grados: body.angulo_grados ?? null,
    agarre: body.agarre ?? null,
    postura: body.postura ?? null,
    unilateral: (body.unilateral ?? DEFAULTS.unilateral) ? 1 : 0,
    mecanica: body.mecanica,
    fuerza: body.fuerza,
    sesgo_longitud: body.sesgo_longitud,
    perfil_resistencia: body.perfil_resistencia ?? DEFAULTS.perfil_resistencia,
    cadena: body.cadena ?? DEFAULTS.cadena,
    carga_axial: (body.carga_axial ?? DEFAULTS.carga_axial) ? 1 : 0,
    costo_fatiga: body.costo_fatiga,
    demanda_estabilidad: body.demanda_estabilidad,
    demanda_tecnica: body.demanda_tecnica,
    notas_tecnicas: body.notas_tecnicas ?? null,
    contraindicaciones: body.contraindicaciones ?? null,
    cues: body.cues ?? null,
  };

  const id = db.transaction(() => {
    const newId = insEx.run(params).lastInsertRowid as number;
    musculos.forEach((m, i) => insMus.run(newId, m.musculo_id, m.rol, i + 1, m.fraccion_volumen));
    return newId;
  })();

  const row = db
    .prepare(
      `SELECT ${DETALLE_COLS}
       FROM exercises e
       LEFT JOIN patrones p ON p.id = e.patron_id
       LEFT JOIN exercises padre ON padre.id = e.ejercicio_padre_id
       WHERE e.id = ?`
    )
    .get(id) as Omit<ExerciseDetalle, "variantes" | "musculos">;

  res.status(201).json(attachMusculosYVariantes(row));
});

// PATCH /api/exercises/:id — merge parcial (undefined no toca el campo, null
// explícito lo limpia). `musculos` ausente no toca la grilla; presente
// reemplaza la grilla ENTERA (DELETE+INSERT, nunca merge fila a fila — mismo
// criterio que seedEjercicioMusculos: un músculo sacado debe desaparecer de
// verdad, no quedar huérfano inflando volumen). La validación corre sobre el
// estado RESULTANTE del merge, no sobre el body: p.ej. `{tipo_variante: null}`
// es inocuo mirado solo, pero deja una variante sin tipo si tiene padre.
exercisesRouter.patch("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  const actual = db.prepare("SELECT * FROM exercises WHERE id = ?").get(id) as
    | (Omit<ExerciseDetalle, "variantes" | "musculos" | "patron_nombre" | "ejercicio_padre_nombre">)
    | undefined;
  if (!actual) return res.status(404).json({ error: "ejercicio no encontrado" });

  if (esCurado(actual.nombre)) {
    return res.status(409).json({
      error: `"${actual.nombre}" es un ejercicio del catálogo curado: el seed revertiría el cambio en el próximo arranque. editalo en server/src/seed/ejercicios/`,
    });
  }

  const body = (req.body ?? {}) as Partial<NewExerciseInput>;

  const rechazado = rechazarCamposServerControlled(body as Record<string, unknown>);
  if (rechazado) return res.status(400).json({ error: rechazado });

  const pick = <T>(v: T | undefined, cur: T): T => (v !== undefined ? v : cur);

  const nombre = body.nombre !== undefined ? body.nombre.trim() : actual.nombre;
  if (!nombre) return res.status(400).json({ error: "nombre requerido" });

  if (nombre !== actual.nombre) {
    if (esCurado(nombre)) {
      return res.status(409).json({
        error: `"${nombre}" está en el catálogo curado: el seed lo sobreescribiría en el próximo arranque. usá otro nombre`,
      });
    }
    if (nombreDuplicado(nombre, id)) {
      return res.status(409).json({ error: `ya existe un ejercicio "${nombre}"` });
    }
  }

  const next = {
    categoria: pick(body.categoria, actual.categoria),
    patron_id: pick(body.patron_id, actual.patron_id),
    ejercicio_padre_id: pick(body.ejercicio_padre_id, actual.ejercicio_padre_id),
    tipo_variante: pick(body.tipo_variante, actual.tipo_variante),
    transferencia: pick(body.transferencia, actual.transferencia),
    proposito: pick(body.proposito, actual.proposito),
    implemento: pick(body.implemento, actual.implemento),
    angulo_grados: pick(body.angulo_grados, actual.angulo_grados),
    agarre: pick(body.agarre, actual.agarre),
    postura: pick(body.postura, actual.postura),
    unilateral: pick(body.unilateral === undefined ? undefined : body.unilateral ? 1 : 0, actual.unilateral),
    mecanica: pick(body.mecanica, actual.mecanica),
    fuerza: pick(body.fuerza, actual.fuerza),
    sesgo_longitud: pick(body.sesgo_longitud, actual.sesgo_longitud),
    perfil_resistencia: pick(body.perfil_resistencia, actual.perfil_resistencia),
    cadena: pick(body.cadena, actual.cadena),
    carga_axial: pick(body.carga_axial === undefined ? undefined : body.carga_axial ? 1 : 0, actual.carga_axial),
    costo_fatiga: pick(body.costo_fatiga, actual.costo_fatiga),
    demanda_estabilidad: pick(body.demanda_estabilidad, actual.demanda_estabilidad),
    demanda_tecnica: pick(body.demanda_tecnica, actual.demanda_tecnica),
    notas_tecnicas: pick(body.notas_tecnicas, actual.notas_tecnicas),
    contraindicaciones: pick(body.contraindicaciones, actual.contraindicaciones),
    cues: pick(body.cues, actual.cues),
  };

  // Grilla efectiva para validar: la del body si vino, si no la actual (leída
  // de la DB) — así "no tocar musculos" no se confunde con "sin músculos".
  let musculosBody: MusculoGridInput[] | undefined;
  if (body.musculos !== undefined) {
    if (!Array.isArray(body.musculos)) {
      return res.status(400).json({ error: "musculos debe ser un array" });
    }
    musculosBody = body.musculos as MusculoGridInput[];
  }
  const grillaActual = db
    .prepare(
      `SELECT musculo_id, rol, fraccion_volumen AS fraccion FROM ejercicio_musculos WHERE exercise_id = ? ORDER BY orden`
    )
    .all(id) as Array<{ musculo_id: number; rol: string; fraccion: number }>;
  const grillaEfectiva: MusculoGridInput[] =
    musculosBody ??
    grillaActual.map((m) => ({ musculo_id: m.musculo_id, rol: m.rol, fraccion_volumen: m.fraccion }));

  const normalizado = aEjercicioNormalizado(nombre, next.patron_id, next.ejercicio_padre_id, next, grillaEfectiva);
  const errores = validarEjercicio(normalizado);
  if (errores.length > 0) return res.status(400).json({ error: errores[0] });

  if (next.patron_id !== actual.patron_id && next.patron_id !== null && !patronExiste(next.patron_id)) {
    return res.status(400).json({ error: `patron_id inválido: ${next.patron_id}` });
  }
  if (musculosBody !== undefined) {
    const faltantes = musculosInexistentes(musculosBody.map((m) => m.musculo_id));
    if (faltantes.length > 0) {
      return res.status(400).json({ error: `musculo_id inexistente: ${faltantes[0]}` });
    }
  }
  if (next.ejercicio_padre_id !== actual.ejercicio_padre_id) {
    const errorLinaje = validarLinajeDb(id, next.ejercicio_padre_id);
    if (errorLinaje) return res.status(400).json({ error: errorLinaje });
  }

  const updEx = db.prepare(
    `UPDATE exercises SET
       nombre=@nombre, categoria=@categoria,
       patron_id=@patron_id, ejercicio_padre_id=@ejercicio_padre_id, tipo_variante=@tipo_variante,
       transferencia=@transferencia, proposito=@proposito,
       implemento=@implemento, angulo_grados=@angulo_grados, agarre=@agarre, postura=@postura,
       unilateral=@unilateral, mecanica=@mecanica, fuerza=@fuerza, sesgo_longitud=@sesgo_longitud,
       perfil_resistencia=@perfil_resistencia, cadena=@cadena, carga_axial=@carga_axial,
       costo_fatiga=@costo_fatiga, demanda_estabilidad=@demanda_estabilidad, demanda_tecnica=@demanda_tecnica,
       notas_tecnicas=@notas_tecnicas, contraindicaciones=@contraindicaciones, cues=@cues
     WHERE id=@id`
  );
  const delMus = db.prepare("DELETE FROM ejercicio_musculos WHERE exercise_id = ?");
  const insMus = db.prepare(
    `INSERT INTO ejercicio_musculos (exercise_id, musculo_id, rol, orden, fraccion_volumen)
     VALUES (?, ?, ?, ?, ?)`
  );

  db.transaction(() => {
    updEx.run({ id, nombre, ...next });
    if (musculosBody !== undefined) {
      delMus.run(id);
      musculosBody.forEach((m, i) => insMus.run(id, m.musculo_id, m.rol, i + 1, m.fraccion_volumen));
    }
  })();

  const row = db
    .prepare(
      `SELECT ${DETALLE_COLS}
       FROM exercises e
       LEFT JOIN patrones p ON p.id = e.patron_id
       LEFT JOIN exercises padre ON padre.id = e.ejercicio_padre_id
       WHERE e.id = ?`
    )
    .get(id) as Omit<ExerciseDetalle, "variantes" | "musculos">;

  res.json(attachMusculosYVariantes(row));
});
