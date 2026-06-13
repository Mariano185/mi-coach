import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../api";
import type { ProgramWeekDetail } from "../../types";
import { useProgramsContext } from "../Programs";
import { CoachNotes } from "../../components/CoachNotes";
import { IconList, IconCalendar } from "../../components/icons";

function fmtFecha(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "numeric", year: "2-digit" });
}

export function WeekView() {
  const { weekId: weekIdParam } = useParams();
  const weekId = Number(weekIdParam);
  const { weeks } = useProgramsContext();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<ProgramWeekDetail | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!Number.isInteger(weekId)) {
      setErr("semana inválida");
      return;
    }
    setDetail(null);
    api.getProgramWeek(weekId).then(setDetail).catch((e) => setErr(e.message));
  }, [weekId]);

  if (err) return <p style={{ color: "var(--danger)" }}>{err}</p>;

  return (
    <div>
      <div className="prog-nav" style={{ justifyContent: "space-between" }}>
        <div className="week-switch">
          <label htmlFor="week-sel">Semana</label>
          <select
            id="week-sel"
            value={Number.isInteger(weekId) ? weekId : ""}
            onChange={(e) => navigate(`/programs/weeks/${e.target.value}`)}
          >
            {weeks.map((w) => (
              <option key={w.id} value={w.id}>
                {w.semana}
                {w.nombre ? ` · ${w.nombre}` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {detail ? (
        <>
          <h2 className="prog-title">
            Semana {detail.semana}
            {detail.nombre ? <span className="sub">{detail.nombre}</span> : null}
          </h2>

          <div className="card-grid">
            {detail.days.map((d) => {
              const pct = d.n_series ? d.n_series_hechas / d.n_series : 0;
              const complete = d.n_series > 0 && d.n_series_hechas === d.n_series;
              const fecha = fmtFecha(d.fecha_plan);
              return (
                <button
                  key={d.id}
                  className={`tile ${complete ? "complete" : ""}`}
                  onClick={() => navigate(`/programs/days/${d.id}`)}
                >
                  <span className="edge">
                    <span className="fill" style={{ height: `${pct * 100}%` }} />
                  </span>
                  <div className="tile-head">
                    <div className="tile-name">Día {d.dia}</div>
                    {d.tipo ? <span className={`pill ${d.tipo}`}>{d.tipo}</span> : null}
                  </div>
                  <div className="tile-meta">
                    <span className="m">
                      <IconList /> {d.n_ejercicios} ejercicios
                    </span>
                    {fecha ? (
                      <span className="m">
                        <IconCalendar /> {fecha}
                      </span>
                    ) : null}
                  </div>
                  {d.titulo ? <div className="tile-sub">{d.titulo}</div> : null}
                  {d.n_series_hechas > 0 ? (
                    <div className="tile-sub">
                      <span className="done-chip">
                        {d.n_series_hechas}/{d.n_series} series hechas
                      </span>
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>

          {detail.notas ? (
            <div className="panel" style={{ marginTop: 22 }}>
              <h2>Notas del coach</h2>
              <CoachNotes text={detail.notas} />
            </div>
          ) : null}
        </>
      ) : (
        <p className="muted">Cargando…</p>
      )}
    </div>
  );
}
