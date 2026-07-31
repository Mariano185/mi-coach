import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import useSWR from "swr";
import { api } from "../../api";
import type { ProgramDayDetail, ProgramExerciseCard, Seccion } from "../../types";
import { swrKeys } from "../../swr";
import { IconBack, IconLayers } from "../../components/icons";
import { CoachNotes } from "../../components/CoachNotes";

const SECCION_LABEL: Record<Seccion, string> = {
  main: "Básicos",
  accesorio: "Accesorios",
  core: "Core / Opcional",
};
const SECCION_ORDER: Seccion[] = ["main", "accesorio", "core"];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function DayView() {
  const { dayId: dayIdParam } = useParams();
  const dayId = Number(dayIdParam);
  const navigate = useNavigate();

  const valid = Number.isInteger(dayId);
  const dayKey = valid ? swrKeys.programDay(dayId) : null;
  const { data, error, mutate } = useSWR<ProgramDayDetail>(dayKey);

  // Campos de sesión editables localmente, sincronizados al blur.
  // fecha/hora_inicio se autosetean solas en el server al completar la primera serie
  // (PATCH /program/sets/:id); este input queda para corregir cargas en diferido.
  const [fecha, setFecha] = useState("");
  const [horaInicio, setHoraInicio] = useState("");
  const [horaFin, setHoraFin] = useState("");

  // Sembrar los inputs locales desde el dato cargado (una vez por día).
  const seededFor = useRef<number | null>(null);
  useEffect(() => {
    if (!data || seededFor.current === dayId) return;
    seededFor.current = dayId;
    setFecha(data.fecha ?? today());
    setHoraInicio(data.hora_inicio ?? "");
    setHoraFin(data.hora_fin ?? "");
  }, [data, dayId]);

  const grouped = useMemo(() => {
    const map = new Map<Seccion, ProgramExerciseCard[]>();
    for (const ex of data?.exercises ?? []) {
      const arr = map.get(ex.seccion) ?? [];
      arr.push(ex);
      map.set(ex.seccion, arr);
    }
    return SECCION_ORDER.filter((s) => map.has(s)).map((s) => [s, map.get(s)!] as const);
  }, [data]);

  const progreso = useMemo(() => {
    const exs = data?.exercises ?? [];
    const total = exs.reduce((a, e) => a + e.n_series, 0);
    const hechas = exs.reduce((a, e) => a + e.n_series_hechas, 0);
    return { total, hechas };
  }, [data]);

  function patchDay(patch: Parameters<typeof api.updateProgramDay>[1]) {
    void api
      .updateProgramDay(dayId, patch)
      .then(() => mutate())
      .catch(() => {});
  }

  if (!valid) return <p style={{ color: "var(--danger)" }}>día inválido</p>;
  if (error) return <p style={{ color: "var(--danger)" }}>{(error as Error).message}</p>;
  if (!data) return <p className="muted">Cargando…</p>;

  return (
    <div>
      <div className="prog-nav">
        <button
          className="prog-back"
          onClick={() => navigate(`/programs/weeks/${data.week_id}`)}
          aria-label="Volver a la semana"
        >
          <IconBack width={18} height={18} />
        </button>
        <span className="prog-crumb">
          Semana <b>{data.semana}</b>
          {data.nombre_semana ? <> · {data.nombre_semana}</> : null}
        </span>
      </div>

      <h2 className="prog-title">
        Día {data.dia}
        {data.tipo ? (
          <span
            className={`pill ${data.tipo === "A" || data.tipo === "B" ? data.tipo : ""}`}
            style={{ marginLeft: 12, verticalAlign: "middle" }}
          >
            {data.tipo === "A" || data.tipo === "B" ? `Opción ${data.tipo}` : data.tipo}
          </span>
        ) : null}
        {data.titulo ? <span className="sub">{data.titulo}</span> : null}
      </h2>

      {/* Fecha y horarios de sesión */}
      <div className="panel" style={{ marginBottom: 18 }}>
        <div className="session-meta-grid">
          <label className="session-meta-field">
            <span className="session-meta-label">Fecha</span>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              onBlur={() => patchDay({ fecha: fecha || null })}
            />
          </label>
          <label className="session-meta-field">
            <span className="session-meta-label">Inicio</span>
            <input
              type="time"
              value={horaInicio}
              onChange={(e) => setHoraInicio(e.target.value)}
              onBlur={() => patchDay({ hora_inicio: horaInicio || null })}
            />
          </label>
          <label className="session-meta-field">
            <span className="session-meta-label">Fin</span>
            <input
              type="time"
              value={horaFin}
              onChange={(e) => setHoraFin(e.target.value)}
              onBlur={() => patchDay({ hora_fin: horaFin || null })}
            />
          </label>
        </div>
        <button
          className="btn secondary"
          style={{ marginTop: 14 }}
          onClick={() => {
            const fechaTrac = data.fecha ?? today();
            navigate(`/trac?fecha=${fechaTrac}&returnTo=/programs/days/${dayId}`);
          }}
        >
          Trac
        </button>
      </div>

      {data.warmup ? (
        <div className="panel" style={{ marginBottom: 18 }}>
          <h3 style={{ marginTop: 0 }}>Warm-up</h3>
          <CoachNotes text={data.warmup} />
        </div>
      ) : null}

      <div className="panel" style={{ marginBottom: 18 }}>
        <h3 style={{ marginTop: 0 }}>Notas del día</h3>
        {data.notas ? <CoachNotes text={data.notas} /> : <p className="muted" style={{ margin: 0 }}>Sin notas.</p>}
      </div>

      {grouped.map(([sec, items]) => (
        <section key={sec}>
          <h3 className={`sec-label ${sec === "main" ? "main" : ""}`}>{SECCION_LABEL[sec]}</h3>
          <div className="card-grid">
            {items.map((ex) => {
              const pct = ex.n_series ? ex.n_series_hechas / ex.n_series : 0;
              const complete = ex.n_series > 0 && ex.n_series_hechas === ex.n_series;
              return (
                <button
                  key={ex.id}
                  className={`tile ${complete ? "complete" : ""}`}
                  onClick={() => navigate(`/programs/days/${dayId}/exercises/${ex.id}`)}
                >
                  <span className="edge">
                    <span className="fill" style={{ height: `${pct * 100}%` }} />
                  </span>
                  <div className="tile-head">
                    <div className="tile-name">{ex.nombre}</div>
                  </div>
                  <div className="tile-meta">
                    <span className="m">
                      <IconLayers /> {ex.n_series} series
                    </span>
                    {ex.n_series_hechas > 0 ? (
                      <span className="done-chip">{ex.n_series_hechas}/{ex.n_series} hechas</span>
                    ) : null}
                  </div>
                  {ex.reps_text || ex.carga_text || ex.rpe_text ? (
                    <div className="tile-sub">
                      {ex.reps_text ?? "—"} · {ex.carga_text ?? "—"} · RPE {ex.rpe_text ?? "—"}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>
      ))}

      <div className="panel" style={{ marginTop: 24, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Progreso del día
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700 }}>
            {progreso.hechas} / {progreso.total} series
            {progreso.hechas > 0 ? <span className="done-chip" style={{ marginLeft: 12 }}>✓ en historial</span> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
