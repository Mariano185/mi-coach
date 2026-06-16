import { useMemo, useState } from "react";
import useSWR from "swr";
import { api } from "../api";
import type { Exercise, Session, SessionWithSets } from "../types";
import { swrKeys } from "../swr";

export function History() {
  const { data: sessions = [], error: errSessions } = useSWR<Session[]>(swrKeys.sessions());
  const { data: exercises = [], error: errExercises } = useSWR<Exercise[]>(swrKeys.exercises());
  const [filterEx, setFilterEx] = useState("");
  const [open, setOpen] = useState<Record<number, SessionWithSets>>({});
  const [loadErr, setLoadErr] = useState("");
  const err = errSessions ? (errSessions as Error).message
    : errExercises ? (errExercises as Error).message
    : loadErr;

  async function toggle(id: number) {
    if (open[id]) {
      setOpen((o) => {
        const next = { ...o };
        delete next[id];
        return next;
      });
      return;
    }
    try {
      const full = await api.getSession(id);
      setOpen((o) => ({ ...o, [id]: full }));
    } catch (e) {
      setLoadErr((e as Error).message);
    }
  }

  // Filtro por ejercicio: muestra solo sesiones que incluyen ese ejercicio.
  // Como la lista base no trae sets, expandimos perezosamente; el filtro aplica
  // sobre las que ya estén abiertas + las que matcheen al cargar detalle.
  const filtered = useMemo(() => sessions, [sessions]);
  const filterId = filterEx ? Number(filterEx) : null;

  return (
    <div>
      <div className="panel">
        <h2>Historial de sesiones</h2>
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

        {filtered.length === 0 && <p className="muted">No hay sesiones registradas.</p>}

        {filtered.map((s) => {
          const detail = open[s.id];
          // Si hay filtro y la sesión está expandida, ocultar las que no contienen el ejercicio.
          if (filterId && detail && !detail.sets.some((x) => x.exercise_id === filterId)) {
            return null;
          }
          return (
            <details key={s.id} open={!!detail} onToggle={() => { /* controlado abajo */ }}>
              <summary onClick={(e) => { e.preventDefault(); toggle(s.id); }}>
                <span className={`pill ${s.tipo}`}>Sesión {s.tipo}</span>{" "}
                <strong>{s.fecha}</strong>{" "}
                {s.energia != null && <span className="muted">· energía {s.energia}</span>}
                {s.comentarios && <span className="muted"> · {s.comentarios}</span>}
              </summary>
              {detail && (
                <table>
                  <thead>
                    <tr><th>Ejercicio</th><th>#</th><th>Peso</th><th>Reps</th><th>RPE</th><th>RIR</th><th>e1RM</th></tr>
                  </thead>
                  <tbody>
                    {detail.sets
                      .filter((x) => !filterId || x.exercise_id === filterId)
                      .map((x) => (
                        <tr key={x.id}>
                          <td>{x.exercise_nombre}</td>
                          <td>{x.n_serie}</td>
                          <td>{x.peso_kg}</td>
                          <td>{x.reps}</td>
                          <td>{x.rpe ?? "—"}</td>
                          <td>{x.rir ?? "—"}</td>
                          <td>{x.e1rm}</td>
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
