import type { Currency } from './types';

const SYMBOLS: Record<Currency, string> = { ARS: '$', USD: 'US$' };

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Formatea centavos al estilo argentino: `$ 12.300` o `US$ 1.250,50`. */
export function formatMoney(cents: number, currency: Currency = 'ARS', opts?: { sign?: boolean }): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const whole = Math.floor(abs / 100);
  const fraction = abs % 100;
  let out = `${SYMBOLS[currency]} ${groupThousands(String(whole))}`;
  if (fraction !== 0) out += `,${String(fraction).padStart(2, '0')}`;
  if (negative) return `-${out}`;
  if (opts?.sign && cents > 0) return `+${out}`;
  return out;
}

/** Versión compacta para gráficos y chips: `$ 12,3k`, `$ 1,2M`. */
export function formatCompact(cents: number, currency: Currency = 'ARS'): string {
  const value = Math.abs(cents) / 100;
  const sign = cents < 0 ? '-' : '';
  const fmt = (n: number) => n.toFixed(1).replace(/\.0$/, '').replace('.', ',');
  if (value >= 1_000_000) return `${sign}${SYMBOLS[currency]} ${fmt(value / 1_000_000)}M`;
  if (value >= 10_000) return `${sign}${SYMBOLS[currency]} ${fmt(value / 1_000)}k`;
  return formatMoney(cents, currency);
}

/**
 * Convierte lo que escribe una persona a centavos.
 * Acepta `12300`, `12.300`, `12.300,50`, `12300.5`, `12,5` y `$ 1.000`.
 * Devuelve `null` si no es un número válido.
 */
export function parseAmount(input: string): number | null {
  let s = input.replace(/[^\d.,-]/g, '');
  if (!s || s === '-' ) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma !== -1 && lastDot !== -1) {
    // El último separador es el decimal; el otro, de miles.
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma !== -1) {
    s = s.replace(',', '.');
  } else if (lastDot !== -1) {
    // Solo puntos: si hay más de uno o tres dígitos detrás, son separadores de miles.
    const decimals = s.length - lastDot - 1;
    const dots = s.split('.').length - 1;
    if (dots > 1 || decimals === 3) s = s.replace(/\./g, '');
  }
  const value = Number(s);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

/** Centavos a texto editable (`12300,5`), para precargar inputs. */
export function centsToInput(cents: number): string {
  if (cents % 100 === 0) return String(cents / 100);
  return (cents / 100).toFixed(2).replace('.', ',');
}

/**
 * Reparte `total` centavos según `weights` sin perder ni inventar centavos
 * (método del resto mayor). El orden de las claves desempata.
 */
export function allocate(total: number, weights: Record<string, number>): Record<string, number> {
  const ids = Object.keys(weights).filter((id) => weights[id] > 0);
  const result: Record<string, number> = {};
  if (ids.length === 0) return result;
  const sum = ids.reduce((acc, id) => acc + weights[id], 0);
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  let assigned = 0;
  const remainders = ids.map((id, index) => {
    const exact = (abs * weights[id]) / sum;
    const floor = Math.floor(exact);
    result[id] = floor;
    assigned += floor;
    return { id, rest: exact - floor, index };
  });
  remainders.sort((a, b) => b.rest - a.rest || a.index - b.index);
  for (let i = 0; i < abs - assigned; i++) result[remainders[i % remainders.length].id] += 1;
  if (sign < 0) for (const id of ids) result[id] = -result[id];
  return result;
}
