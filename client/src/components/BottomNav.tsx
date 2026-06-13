// Bottom tab bar (solo mobile < 600px). 5 destinos principales.
import { NavLink } from "react-router-dom";
import {
  IconDashboard,
  IconHistory,
  IconLog,
  IconPrograms,
  IconWeight,
} from "./icons";

const ITEMS: Array<{ to: string; label: string; Icon: typeof IconLog; end?: boolean }> = [
  { to: "/dashboard", label: "Dashboard", Icon: IconDashboard, end: true },
  { to: "/log", label: "Sesión", Icon: IconLog, end: true },
  { to: "/weight", label: "Peso", Icon: IconWeight, end: true },
  { to: "/history", label: "Historial", Icon: IconHistory, end: true },
  { to: "/programs", label: "Programas", Icon: IconPrograms },
];

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Navegación principal">
      {ITEMS.map(({ to, label, Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) => (isActive ? "active" : "")}
        >
          <Icon width={22} height={22} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
