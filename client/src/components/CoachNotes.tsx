// Renderiza notas del coach: markdown mínimo (negritas **x** + lista "-").
// No traemos una lib de markdown completa: el coach solo usa estas 2 marcas.

function renderInline(text: string): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(<strong key={key++}>{m[1]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function CoachNotes({ text }: { text: string }) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const items: string[] = [];
  const paras: string[] = [];
  for (const l of lines) {
    if (l.startsWith("-")) items.push(l.replace(/^-\s*/, ""));
    else paras.push(l);
  }
  return (
    <div className="coach-notes">
      {paras.map((p, i) => (
        <p key={`p${i}`}>{renderInline(p)}</p>
      ))}
      {items.length > 0 ? (
        <ul>
          {items.map((it, i) => (
            <li key={`l${i}`}>{renderInline(it)}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
