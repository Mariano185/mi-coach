import useSWR from "swr";
import { useNavigate, useParams } from "react-router-dom";
import type { ProgramWeekDetail } from "../../types";
import { swrKeys } from "../../swr";
import { useProgramsContext } from "../Programs";
import { CoachNotes } from "../../components/CoachNotes";
import { Expandable } from "../../components/Expandable";
import { IconList, IconCalendar } from "../../components/icons";

function fmtFecha(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "numeric", year: "2-digit" });
}

export function WeekView() {
  const { weekId: weekIdParam } = useParams();
  const weekId = Number(weekIdParam);
  const { weeks, mesociclos, mesocicloActivo, setMesocicloActivo } = useProgramsContext();
  const navigate = useNavigate();

  const valid = Number.isInteger(weekId);
  const { data: detail, error } = useSWR<ProgramWeekDetail>(
    valid ? swrKeys.programWeek(weekId) : null
  );

  const weeksDelMesociclo =
    mesociclos.length === 0 ? weeks : weeks.filter((w) => w.mesociclo_id === mesocicloActivo);
  const mesocicloNombre = mesociclos.find((m) => m.id === mesocicloActivo)?.nombre ?? null;

  function onCambiarMesociclo(idStr: string) {
    const id = idStr === "" ? null : Number(idStr);
    setMesocicloActivo(id);
    const semanasDestino =
      id == null ? weeks.filter((w) => w.mesociclo_id == null) : weeks.filter((w) => w.mesociclo_id === id);
    const first = semanasDestino[0]?.id;
    if (first != null) navigate(`/programs/weeks/${first}`);
  }

  if (!valid) return <p style={{ color: "var(--danger)" }}>semana inválida</p>;
  if (error) return <p style={{ color: "var(--danger)" }}>{(error as Error).message}</p>;

  return (
    <div>
      <div className="prog-nav" style={{ justifyContent: "space-between" }}>
        {mesociclos.length > 0 ? (
          <div className="week-switch">
            <label htmlFor="mesociclo-sel">Mesociclo</label>
            <select
              id="mesociclo-sel"
              value={mesocicloActivo ?? ""}
              onChange={(e) => onCambiarMesociclo(e.target.value)}
            >
              {mesociclos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
              <option value="">Sin mesociclo</option>
            </select>
          </div>
        ) : null}
        <div className="week-switch">
          <label htmlFor="week-sel">Semana</label>
          <select
            id="week-sel"
            value={Number.isInteger(weekId) ? weekId : ""}
            onChange={(e) => navigate(`/programs/weeks/${e.target.value}`)}
          >
            {weeksDelMesociclo.map((w) => (
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
            {mesocicloNombre ? <span className="sub">{mesocicloNombre}</span> : null}
            {detail.nombre ? <span className="sub">{detail.nombre}</span> : null}
          </h2>

          <div className="card-grid">
            {detail.days.map((d) => {
              const pct = d.n_series ? d.n_series_hechas / d.n_series : 0;
              const complete = d.n_series > 0 && d.n_series_hechas === d.n_series;
              const fecha = fmtFecha(d.fecha);
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
                    {d.tipo ? (
                      <span className={`pill ${d.tipo === "A" || d.tipo === "B" ? d.tipo : ""}`}>{d.tipo}</span>
                    ) : null}
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
              <Expandable>
                <CoachNotes text={detail.notas} />
              </Expandable>
            </div>
          ) : null}
        </>
      ) : (
        <p className="muted">Cargando…</p>
      )}
    </div>
  );
}
