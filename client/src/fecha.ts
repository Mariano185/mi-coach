// Fecha LOCAL de hoy en YYYY-MM-DD. No toISOString(): de noche en UTC−3 la fecha UTC ya
// es mañana, y las cargas por fecha (Ingesta diaria, Registro corporal) se hacen al cerrar el día.
export function hoyLocal(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
