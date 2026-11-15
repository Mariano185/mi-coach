// Bottom tab bar (solo mobile < 600px). 4 destinos principales.
import { NavLink } from "react-router-dom";
import {
  IconDashboard,
  IconNutrition,
  IconPrograms,
  IconWeight,
} from "./icons";

const ITEMS: Array<{ to: string; label: string; Icon: typeof IconDashboard; end?: boolean }> = [
  { to: "/dashboard", label: "Dashboard", Icon: IconDashboard, end: true },
  { to: "/nutricion", label: "Nutrición", Icon: IconNutrition, end: true },
  { to: "/cuerpo", label: "Cuerpo", Icon: IconWeight, end: true },
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
