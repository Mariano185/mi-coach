import type { E1rmConfianza } from "../types";

// Datos reales de la serie, solo para explicar por qué no hay e1RM.
interface SerieReal {
  real_peso: number | null;
  real_reps: number | null;
  real_rpe: number | null;
}

// Motivo por el que el server no da e1RM. Espeja las reglas de server/src/e1rm-sql.ts
// (RPE mínimo 5, máximo 10 reps proyectadas al fallo); si cambian allá, cambiar acá.
// null = la serie todavía no tiene peso y reps (no hay nada que explicar).
function motivoSinE1rm(s: SerieReal): { tag: string; title: string } | null {
  if (s.real_peso == null || s.real_reps == null) return null;
  if (s.real_rpe == null) {
    return { tag: "sin RPE", title: "Sin e1RM: falta el RPE (no se asume RPE 10)" };
  }
  if (s.real_rpe < 5) {
    return { tag: "RPE < 5", title: "Sin e1RM: con RPE menor a 5 la estimación no es confiable" };
  }
  const proyectadas = s.real_reps + 10 - s.real_rpe;
  if (proyectadas > 10) {
    return {
      tag: "> 10 reps",
      title: `Sin e1RM: proyecta ${proyectadas} reps al fallo y la tabla RTS llega hasta 10`,
    };
  }
  return null;
}

// e1RM de una serie tal como lo calcula el server (v_program_sets_e1rm: RPE + tabla RTS).
// Sin e1RM: si la serie ya tiene peso+reps, el motivo en lugar del número (sin RPE,
// RPE < 5 o > 10 reps proyectadas); si no, "—". Confianza baja (RPE 5–6,5) se muestra atenuada y con
// etiqueta: es un dato, pero no cuenta para el mejor e1RM.
export function E1rmValor({
  e1rm,
  confianza,
  serie,
}: {
  e1rm: number | null;
  confianza: E1rmConfianza | null;
  serie?: SerieReal;
}) {
  if (e1rm == null) {
    const motivo = serie ? motivoSinE1rm(serie) : null;
    if (motivo) {
      return (
        <span className="e1rm e1rm--motivo" title={motivo.title}>
          {motivo.tag}
        </span>
      );
    }
    return <span className="e1rm e1rm--vacio" title="Sin e1RM: falta RPE, RPE < 5 o más de 10 reps al fallo">—</span>;
  }
  if (confianza === "baja") {
    return (
      <span className="e1rm e1rm--baja" title="Confianza baja (RPE < 7): no cuenta para el mejor e1RM">
        {e1rm}
        <span className="e1rm-tag">baja</span>
      </span>
    );
  }
  return <span className="e1rm">{e1rm}</span>;
}
