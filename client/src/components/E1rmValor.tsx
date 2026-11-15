import type { E1rmConfianza } from "../types";

// e1RM de una serie tal como lo calcula el server (v_program_sets_e1rm: RPE + tabla RTS).
// "—" cuando no hay (sin RPE, RPE < 5 o > 10 reps proyectadas). Confianza baja (RPE 5–6,5)
// se muestra atenuada y con etiqueta: es un dato, pero no cuenta para el mejor e1RM.
export function E1rmValor({ e1rm, confianza }: { e1rm: number | null; confianza: E1rmConfianza | null }) {
  if (e1rm == null) {
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
