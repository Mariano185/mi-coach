import useSWR from "swr";
import { useNavigate } from "react-router-dom";
import type { Stats } from "../types";
import { swrKeys } from "../swr";

// Recencia legible desde una fecha YYYY-MM-DD. Date.UTC evita que la comparación se corra
// un día según la zona horaria del navegador (las fechas del server son solo la parte de fecha).
function hace(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const dias = Math.round((Date.now() - Date.UTC(y, m - 1, d)) / 86_400_000);
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  return `hace ${dias} días`;
}

export function Dashboard() {
  const { data: stats, error } = useSWR<Stats>(swrKeys.stats());
  const navigate = useNavigate();

  if (error) return <div className="panel"><p style={{ color: "var(--danger)" }}>{(error as Error).message}</p></div>;
  if (!stats) return <div className="panel"><p className="muted">Cargando…</p></div>;

  return (
    <div>
      <div className="panel" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>¿Cómo llegaste hoy?</h2>
          <p className="muted" style={{ margin: "4px 0 0" }}>Cargá fatiga, descanso y motivación del día.</p>
        </div>
        <button className="btn" onClick={() => navigate("/trac")}>Trac</button>
      </div>

      <div className="panel">
        <h2>e1RM por básico</h2>
        {stats.basicos.length === 0 ? (
          <p className="muted">Sin datos</p>
        ) : (
          <div className="stat-cards">
            {stats.basicos.map((b) => (
              <div className={`stat-card${b.mejor_e1rm == null ? " empty" : ""}`} key={b.exercise_id}>
                <div className="name">{b.nombre}</div>
                {b.mejor_e1rm == null ? (
                  <>
                    <div className="big">Sin datos</div>
                    <div className="delta muted">Cargá una serie para ver tu e1RM</div>
                  </>
                ) : (
                  <>
                    <div className="big">{b.actual_e1rm} kg</div>
                    <div className="delta muted">
                      {b.actual_e1rm === b.mejor_e1rm
                        ? `PR actual · ${hace(b.ultima_fecha!)}`
                        : `PR ${b.mejor_e1rm} kg · ${hace(b.mejor_fecha!)}`}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="panel">
        <h2>e1RM por básico — histórico</h2>
        {stats.basicos.length === 0 ? (
          <p className="muted">Sin datos</p>
        ) : (
          <div className="stat-cards">
            {stats.basicos.map((b) => (
              <div className={`stat-card${b.mejor_e1rm == null ? " empty" : ""}`} key={b.exercise_id}>
                <div className="name">{b.nombre}</div>
                {b.mejor_e1rm == null ? (
                  <>
                    <div className="big">Sin datos</div>
                    <div className="delta muted">Cargá una serie para ver tu e1RM</div>
                  </>
                ) : (
                  <>
                    <div className="big">{b.mejor_e1rm} kg</div>
                    <div className="delta muted">PR · {hace(b.mejor_fecha!)}</div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Volumen semanal (series: básicos vs accesorios)</h2>
        <table>
          <thead>
            <tr><th>Semana (ISO)</th><th>Básicos</th><th>Accesorios</th><th>Total</th></tr>
          </thead>
          <tbody>
            {stats.volumen_semanal.map((v) => (
              <tr key={v.semana}>
                <td>{v.semana}</td>
                <td>{v.series_basicos}</td>
                <td>{v.series_accesorios}</td>
                <td>{v.series_basicos + v.series_accesorios}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
