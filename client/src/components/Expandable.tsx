import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

// Colapsa contenido largo (notas del coach, warmup, etc.) a una altura máxima con
// "Ver más" / "Ver menos". Mide la altura real del contenido en vez de contar
// caracteres: un texto corto con muchos bullets puede ocupar más que uno largo
// sin saltos de línea, así que contar chars no predice el scroll real.
const MAX_HEIGHT_PX = 120;

export function Expandable({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    setOverflows(el.scrollHeight > MAX_HEIGHT_PX + 1);
  }, [children]);

  return (
    <div className="expandable">
      <div
        ref={contentRef}
        className="expandable-content"
        style={
          overflows && !expanded
            ? { maxHeight: MAX_HEIGHT_PX, overflow: "hidden" }
            : undefined
        }
      >
        {children}
      </div>
      {overflows ? (
        <button
          type="button"
          className="expandable-toggle"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Ver menos" : "Ver más"}
        </button>
      ) : null}
    </div>
  );
}
