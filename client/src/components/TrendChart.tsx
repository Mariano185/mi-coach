// Gráfico de líneas SVG mínimo, sin dependencias. Dibuja una o más series.

interface Series {
  label: string;
  color: string;
  points: number[];
}

interface Props {
  labels: string[]; // eje X (fechas o semanas)
  series: Series[];
  height?: number;
  yLabel?: string;
}

export function TrendChart({ labels, series, height = 180, yLabel }: Props) {
  const width = 640;
  const padL = 42;
  const padR = 12;
  const padT = 12;
  const padB = 28;

  const allVals = series.flatMap((s) => s.points).filter((v) => Number.isFinite(v));
  if (allVals.length === 0 || labels.length === 0) {
    return <p className="muted">Sin datos para graficar todavía.</p>;
  }

  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  const span = max - min || 1;
  // Margen para que no toque los bordes.
  const yMin = min - span * 0.1;
  const yMax = max + span * 0.1;

  const n = labels.length;
  const xFor = (i: number) =>
    padL + (n === 1 ? 0 : (i / (n - 1)) * (width - padL - padR));
  const yFor = (v: number) =>
    padT + (1 - (v - yMin) / (yMax - yMin)) * (height - padT - padB);

  const ticks = 4;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => yMin + (i / ticks) * (yMax - yMin));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto" }}>
      {/* Grid + etiquetas Y */}
      {yTicks.map((t, i) => {
        const y = yFor(t);
        return (
          <g key={i}>
            <line x1={padL} y1={y} x2={width - padR} y2={y} stroke="#2e333d" strokeWidth={1} />
            <text x={padL - 6} y={y + 3} fontSize={10} fill="#9aa0aa" textAnchor="end">
              {t.toFixed(1)}
            </text>
          </g>
        );
      })}

      {/* Series */}
      {series.map((s, si) => {
        const d = s.points
          .map((v, i) => (Number.isFinite(v) ? `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(v)}` : ""))
          .filter(Boolean)
          .join(" ");
        return (
          <g key={si}>
            <path d={d} fill="none" stroke={s.color} strokeWidth={2} />
            {s.points.map((v, i) =>
              Number.isFinite(v) ? (
                <circle key={i} cx={xFor(i)} cy={yFor(v)} r={2.5} fill={s.color} />
              ) : null
            )}
          </g>
        );
      })}

      {/* Etiquetas X: primera, media, última para no saturar */}
      {[0, Math.floor((n - 1) / 2), n - 1]
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .map((i) => (
          <text key={i} x={xFor(i)} y={height - 8} fontSize={10} fill="#9aa0aa" textAnchor="middle">
            {labels[i]}
          </text>
        ))}

      {yLabel && (
        <text x={4} y={padT} fontSize={10} fill="#9aa0aa">
          {yLabel}
        </text>
      )}
    </svg>
  );
}
