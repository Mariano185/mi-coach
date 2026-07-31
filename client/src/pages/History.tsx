import { useState } from "react";
import useSWR from "swr";
import { api } from "../api";
import type { Exercise, HistoryDay, HistoryDayDetail } from "../types";
import { swrKeys } from "../swr";

export function History() {
  const { data: days = [], error: errDays } = useSWR<HistoryDay[]>(swrKeys.history());
  const { data: exercises = [], error: errExercises } = useSWR<Exercise[]>(swrKeys.exercises());
  const [filterEx, setFilterEx] = useState("");
  const [open, setOpen] = useState<Record<number, HistoryDayDetail>>({});
  const [loadErr, setLoadErr] = useState("");
  const err = errDays ? (errDays as Error).message
    : errExercises ? (errExercises as Error).message
    : loadErr;

  async function toggle(dayId: number) {
    if (open[dayId]) {
      setOpen((o) => {
        const next = { ...o };
        delete next[dayId];
        return next;
      });
      return;
    }
    try {
      const full = await api.getHistoryDay(dayId);
      setOpen((o) => ({ ...o, [dayId]: full }));
    } catch (e) {
      setLoadErr((e as Error).message);
    }
  }

  const filterId = filterEx ? Number(filterEx) : null;

  return (
    <div>
      <div className="panel">
        <h2>Historial de entrenamientos</h2>
        {err && <p style={{ color: "var(--danger)" }}>{err}</p>}
        <div className="field" style={{ maxWidth: 320 }}>
          <label>Filtrar por ejercicio</label>
          <select value={filterEx} onChange={(e) => setFilterEx(e.target.value)}>
            <option value="">— todos —</option>
            {exercises.map((e) => (
              <option key={e.id} value={e.id}>{e.nombre}</option>
            ))}
          </select>
        </div>

        {days.length === 0 && <p className="muted">No hay entrenamientos registrados.</p>}

        {days.map((d) => {
          const detail = open[d.day_id];
          // Si hay filtro y el día está expandido, ocultar los que no contienen el ejercicio.
          if (filterId && detail && !detail.sets.some((x) => x.exercise_id === filterId)) {
            return null;
          }
          return (
            <details key={d.day_id} open={!!detail} onToggle={() => { /* controlado abajo */ }}>
              <summary onClick={(e) => { e.preventDefault(); toggle(d.day_id); }}>
                {d.tipo ? <><span className="pill">{d.tipo}</span>{" "}</> : null}
                <strong>{d.fecha}</strong>{" "}
                {d.titulo && <span className="muted"> · {d.titulo}</span>}
              </summary>
              {detail && (
                <table>
                  <thead>
                    <tr><th>Ejercicio</th><th>#</th><th>Peso</th><th>Reps</th><th>RPE</th><th>RIR</th><th>e1RM</th></tr>
                  </thead>
                  <tbody>
                    {detail.sets
                      .filter((x) => !filterId || x.exercise_id === filterId)
                      .map((x, i) => (
                        <tr key={i}>
                          <td>{x.exercise_nombre}</td>
                          <td>{x.n_serie}</td>
                          <td>{x.real_peso}</td>
                          <td>{x.real_reps}</td>
                          <td>{x.real_rpe ?? "—"}</td>
                          <td>{x.rir ?? "—"}</td>
                          <td>{x.e1rm ?? "—"}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </details>
          );
        })}
      </div>
    </div>
  );
}
