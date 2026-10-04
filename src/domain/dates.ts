export const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function today(): string {
  return toISODate(new Date());
}

export function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toISODate(d);
}

/** `2026-10-04` → `2026-10` */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function currentMonth(): string {
  return monthOf(today());
}

/** Suma (o resta) meses a una clave `YYYY-MM`. */
export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const index = y * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}

/** Diferencia en meses `b - a`. */
export function monthDiff(a: string, b: string): number {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return yb * 12 + mb - (ya * 12 + ma);
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** Fecha de vencimiento de un día del mes, ajustada si el mes es más corto (31 → 30/28). */
export function dueDate(month: string, day: number): string {
  return `${month}-${pad(Math.min(day, daysInMonth(month)))}`;
}

/** Días calendario entre dos fechas ISO (`b - a`). */
export function daysBetween(a: string, b: string): number {
  const toUTC = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUTC(b) - toUTC(a)) / 86_400_000);
}

/** `2026-10` → `octubre 2026` */
export function monthLabel(month: string, withYear = true): string {
  const [y, m] = month.split('-').map(Number);
  return withYear ? `${MONTHS[m - 1]} ${y}` : MONTHS[m - 1];
}

/** `2026-10-04` → `4 oct` */
export function shortDate(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${d} ${MONTHS[m - 1].slice(0, 3)}`;
}

/** Texto relativo amigable: "hoy", "ayer", "en 3 días", "hace 2 días". */
export function relativeDays(from: string, to: string): string {
  const diff = daysBetween(from, to);
  if (diff === 0) return 'hoy';
  if (diff === 1) return 'mañana';
  if (diff === -1) return 'ayer';
  if (diff > 0) return `en ${diff} días`;
  return `hace ${-diff} días`;
}
