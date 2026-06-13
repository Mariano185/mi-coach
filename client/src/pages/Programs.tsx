import { useEffect, useState } from "react";
import { Navigate, Outlet, useOutletContext } from "react-router-dom";
import { api } from "../api";
import type { ProgramWeek } from "../types";

export type ProgramsContext = { weeks: ProgramWeek[] };

// Padre del subtree /programs/*.
// Carga la lista de semanas UNA vez y la pasa por outlet context
// para que WeekView no re-fetchee al cambiar de semana.
export function Programs() {
  const [weeks, setWeeks] = useState<ProgramWeek[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api
      .getProgramWeeks()
      .then(setWeeks)
      .catch((e) => setErr(e.message));
  }, []);

  if (err) {
    return (
      <div className="panel">
        <p style={{ color: "var(--danger)" }}>{err}</p>
      </div>
    );
  }
  if (weeks === null) {
    return <p className="muted">Cargando…</p>;
  }
  if (weeks.length === 0) {
    return (
      <div className="panel">
        <h2>Programas</h2>
        <p className="muted">
          Todavía no hay semanas cargadas. Abrí Claude Code en esta carpeta y pedí:{" "}
          <em>"analizá la semana y armá la próxima"</em>.
        </p>
      </div>
    );
  }

  return <Outlet context={{ weeks } satisfies ProgramsContext} />;
}

// Hook que las childrend usan para leer la lista de semanas.
export function useProgramsContext(): ProgramsContext {
  return useOutletContext<ProgramsContext>();
}

// Index del subtree: redirige a la primera semana.
// (El padre ya garantizó que hay al menos una semana.)
export function ProgramIndexRedirect() {
  const { weeks } = useProgramsContext();
  const first = weeks[0]?.id;
  if (first == null) return null;
  return <Navigate to={`/programs/weeks/${first}`} replace />;
}
