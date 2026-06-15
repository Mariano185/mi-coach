// Iconos SVG inline (sin dependencias). Heredan currentColor.
import type { SVGProps } from "react";

const base = (p: SVGProps<SVGSVGElement>) => ({
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...p,
});

export function IconList(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(p)}>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

export function IconLayers(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(p)}>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

export function IconCalendar(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(p)}>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

export function IconCheck(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(p)}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function IconBack(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(p)}>
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

// === Íconos de estado de sincronización (nube) ===
// Comparten la silueta de nube; cambia el glyph interno.

const CLOUD_PATH = "M7 18a4 4 0 0 1 0-8 5.5 5.5 0 0 1 10.5-1.5A3.75 3.75 0 0 1 18 18Z";

export function IconCloudCheck(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(p)}>
      <path d={CLOUD_PATH} />
      <polyline points="9.5 13.5 11.5 15.5 15 11.5" />
    </svg>
  );
}

export function IconCloudSync(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(p)}>
      <path d={CLOUD_PATH} />
      <path d="M14.5 13a2.5 2.5 0 1 1-.7-1.8" />
      <polyline points="14 9.5 14 11.5 12 11.5" />
    </svg>
  );
}

export function IconCloudOff(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(p)}>
      <path d={CLOUD_PATH} />
      <line x1="10" y1="11.5" x2="15" y2="16.5" />
      <line x1="15" y1="11.5" x2="10" y2="16.5" />
    </svg>
  );
}

// === Íconos del bottom nav (mobile) ===
// Cada destino principal de la app, mismo lenguaje que el resto.

export function IconWeight(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(p)}>
      <path d="M6.5 6.5h11" />
      <path d="M3.5 10.5h17" />
      <path d="M5 14.5l-1.5 5h17l-1.5-5" />
      <path d="M9 6.5l1-3h4l1 3" />
    </svg>
  );
}

export function IconHistory(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(p)}>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <polyline points="3 4 3 9 8 9" />
      <polyline points="12 7 12 12 16 14" />
    </svg>
  );
}

export function IconDashboard(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(p)}>
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

export function IconPrograms(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(p)}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
