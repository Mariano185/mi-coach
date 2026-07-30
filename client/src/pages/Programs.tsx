import { useEffect, useState } from "react";
import useSWR from "swr";
import { Navigate, Outlet, useOutletContext } from "react-router-dom";
import type { MesocicloConSemanas, ProgramWeek } from "../types";
import { swrKeys } from "../swr";

const MESOCICLO_STORAGE_KEY = "mi-coach:mesociclo-activo";

function readStoredMesociclo(): number | null {
  const raw = localStorage.getItem(MESOCICLO_STORAGE_KEY);
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
}

export type ProgramsContext = {
  weeks: ProgramWeek[]; // todas (para resolver navegación directa por URL)
  mesociclos: MesocicloConSemanas[];
  mesocicloActivo: number | null; // null = "Sin mesociclo" o "no hay mesociclos todavía"
  setMesocicloActivo: (id: number | null) => void;
};

// Padre del subtree /programs/*.
// Carga mesociclos + todas las semanas (cacheados por SWR) y los pasa por outlet
// context, para que WeekView no re-fetchee al cambiar de semana.
export function Programs() {
  const { data: weeks, error: errorWeeks } = useSWR<ProgramWeek[]>(swrKeys.programWeeks());
  const { data: mesociclos, error: errorMesociclos } = useSWR<MesocicloConSemanas[]>(
    swrKeys.mesociclos()
  );

  const [mesocicloActivo, setMesocicloActivoState] = useState<number | null>(() =>
    readStoredMesociclo()
  );

  // Si no hay mesociclo guardado (o el guardado ya no existe), caer al más reciente.
  useEffect(() => {
    if (!mesociclos || mesociclos.length === 0) return;
    const stored = readStoredMesociclo();
    const valid = stored != null && mesociclos.some((m) => m.id === stored);
    if (!valid) {
      setMesocicloActivoState(mesociclos[0].id);
    }
  }, [mesociclos]);

  function setMesocicloActivo(id: number | null) {
    setMesocicloActivoState(id);
    if (id == null) localStorage.removeItem(MESOCICLO_STORAGE_KEY);
    else localStorage.setItem(MESOCICLO_STORAGE_KEY, String(id));
  }

  const error = errorWeeks ?? errorMesociclos;
  if (error) {
    return (
      <div className="panel">
        <p style={{ color: "var(--danger)" }}>{(error as Error).message}</p>
      </div>
    );
  }
  if (weeks === undefined || mesociclos === undefined) {
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

  return (
    <Outlet
      context={
        { weeks, mesociclos, mesocicloActivo, setMesocicloActivo } satisfies ProgramsContext
      }
    />
  );
}

// Hook que las children usan para leer mesociclos/semanas.
export function useProgramsContext(): ProgramsContext {
  return useOutletContext<ProgramsContext>();
}

// Index del subtree: redirige a la primera semana del mesociclo activo
// (o del más reciente). Si no hay mesociclos todavía, cae a la primera semana global.
export function ProgramIndexRedirect() {
  const { weeks, mesociclos, mesocicloActivo } = useProgramsContext();

  const weeksDelMesociclo =
    mesociclos.length === 0
      ? weeks
      : weeks.filter((w) => w.mesociclo_id === mesocicloActivo);

  const first = (weeksDelMesociclo[0] ?? weeks[0])?.id;
  if (first == null) return null;
  return <Navigate to={`/programs/weeks/${first}`} replace />;
}
