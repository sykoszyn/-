import { guessCategory } from './categories';
import { toISODate } from './dates';
import { parseAmount } from './money';
import type { Currency, Member, Split } from './types';

/**
 * Entiende frases como las dice la gente (por voz o escritas) y las convierte en un gasto:
 *   "15 lucas en el súper, pagó Sofi"
 *   "heladera 600 mil en 6 cuotas"
 *   "ayer 100 dólares el airbnb, todo de Sofi"
 */
export type QuickExpense = {
  amount: number | null;
  currency: Currency;
  description: string;
  category: string;
  paidBy: string;
  split: Split;
  installments: number;
  date: string;
};

const ACCENTS: Record<string, string> = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n' };
/** Minúsculas y sin tildes, sin cambiar el largo (para poder ubicar lo encontrado en el texto original). */
const fold = (s: string) => s.toLowerCase().replace(/[áéíóúüñ]/g, (c) => ACCENTS[c]);

const WORD_NUMBERS: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciocho: 18, veinte: 20, veinticuatro: 24, treinta: 30,
  cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100, ciento: 100,
  doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500, seiscientos: 600, setecientos: 700,
  ochocientos: 800, novecientos: 900, medio: 0.5, media: 0.5,
};
const MULTIPLIERS: Record<string, number> = { mil: 1_000, k: 1_000, luca: 1_000, lucas: 1_000, palo: 1_000_000, palos: 1_000_000, millon: 1_000_000, millones: 1_000_000, m: 1_000_000 };

const NUM = `(\\d+(?:[.,]\\d+)*|${Object.keys(WORD_NUMBERS).join('|')})`;
const MULT = `(${Object.keys(MULTIPLIERS).join('|')})`;

function toNumber(token: string): number | null {
  if (token in WORD_NUMBERS) return WORD_NUMBERS[token];
  // "12.500" o "12,5": el separador es decimal solo si quedan 1 o 2 dígitos detrás.
  const decimal = token.match(/^(\d+)[.,](\d{1,2})$/);
  if (decimal) return Number(`${decimal[1]}.${decimal[2]}`);
  // "12.345,50": miles con punto y decimales con coma.
  if (token.includes('.') && token.includes(',')) {
    const cents = parseAmount(token);
    return cents === null ? null : cents / 100;
  }
  const n = Number(token.replace(/[.,]/g, ''));
  return Number.isFinite(n) ? n : null;
}

const FILLER = new Set([
  'gaste', 'pague', 'puse', 'compre', 'compramos', 'pagamos', 'gastamos', 'pagaste', 'gastaste', 'fue', 'fueron', 'son', 'es',
  'en', 'el', 'la', 'los', 'las', 'de', 'del', 'por', 'para', 'un', 'una', 'y', 'con', 'que', 'al', 'a', 'pesos', 'peso', '$',
  'cuotas', 'cuota', 'me', 'nos', 'salio', 'costo', 'mas',
]);

function yesterdayOf(today: string, days: number) {
  const [y, m, d] = today.split('-').map(Number);
  return toISODate(new Date(y, m - 1, d - days));
}

export function parseQuickExpense(text: string, members: Member[], meId: string, today: string): QuickExpense {
  const src = text.trim();
  const low = fold(src);
  const used = new Array<boolean>(src.length).fill(false);
  const take = (re: RegExp): RegExpExecArray | null => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(low))) {
      const start = m.index;
      const end = start + m[0].length;
      if (!used.slice(start, end).some(Boolean)) {
        for (let i = start; i < end; i++) used[i] = true;
        return m;
      }
      if (!re.global) break;
    }
    return null;
  };
  const names = members.map((m) => ({ id: m.id, name: fold(m.name) })).filter((m) => m.name);
  const nameRe = names.map((n) => n.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') || '(?!)';
  const memberByName = (n: string) => names.find((x) => x.name === n)?.id;

  // Cuotas primero, así "en 6 cuotas" no se confunde con el monto.
  let installments = 1;
  const cuotas = take(new RegExp(`\\b(?:en\\s+)?${NUM}\\s+cuotas?\\b`, 'g'));
  if (cuotas) installments = Math.max(1, Math.round(toNumber(cuotas[1]) ?? 1));

  // Fecha.
  let date = today;
  if (take(/\b(?:anteayer|antes de ayer)\b/g)) date = yesterdayOf(today, 2);
  else if (take(/\bayer\b/g)) date = yesterdayOf(today, 1);
  else take(/\bhoy\b/g);

  // Moneda.
  let currency: Currency = 'ARS';
  if (take(/\b(?:dolares|dolar|usd|u\$s|us\$|verdes)\b/g)) currency = 'USD';

  // Monto: número con multiplicador opcional ("15 lucas", "1,5 palos", "medio palo", "$ 12.500").
  let amount: number | null = null;
  const withMult = take(new RegExp(`(?:\\$\\s*)?\\b${NUM}\\s*${MULT}\\b(?:\\s+y\\s+media)?`, 'g'));
  if (withMult) {
    const base = toNumber(withMult[1]) ?? 0;
    const extra = /y\s+media$/.test(withMult[0]) ? 0.5 : 0;
    amount = Math.round((base + extra) * MULTIPLIERS[withMult[2]] * 100);
  } else {
    const alone = take(/(?:\$\s*)?\b(\d+(?:[.,]\d+)*)\b/g) ?? take(/\b(mil)\b/g);
    if (alone) amount = alone[1] === 'mil' ? 1_000_00 : Math.round((toNumber(alone[1]) ?? 0) * 100) || null;
  }

  // Quién pagó.
  let paidBy = meId;
  const payerAfter = take(new RegExp(`\\b(?:pago|pagaste|puso|lo pago|la pago)\\s+(${nameRe})\\b`, 'g'));
  const payerBefore = payerAfter ? null : take(new RegExp(`\\b(${nameRe})\\s+(?:pago|puso|gasto|compro)\\b`, 'g'));
  const payer = payerAfter ?? payerBefore;
  if (payer) paidBy = memberByName(payer[1]) ?? meId;
  else take(/\b(?:pague yo|pague|lo pague|puse yo|puse)\b/g);

  // Cómo se divide.
  let split: Split = { mode: 'equal' };
  const full = take(new RegExp(`\\b(?:es\\s+)?(?:todo\\s+(?:de|para)|es\\s+de|es\\s+para|solo\\s+de|para)\\s+(${nameRe}|mi|vos)\\b`, 'g'));
  if (full) {
    const who = full[1] === 'mi' ? meId : full[1] === 'vos' ? undefined : memberByName(full[1]);
    if (who) split = { mode: 'full', memberId: who };
  } else if (take(/\b(?:segun (?:los )?ingresos|proporcional)\b/g)) split = { mode: 'income' };
  else take(/\b(?:a medias|mitad y mitad|mitad)\b/g);

  // Lo que queda es la descripción.
  let rest = '';
  for (let i = 0; i < src.length; i++) rest += used[i] ? ' ' : src[i];
  const words = rest
    .split(/[\s,.;:!?]+/)
    .filter(Boolean)
    .filter((w) => !FILLER.has(fold(w)));
  let description = words.join(' ').trim();
  const category = guessCategory(description || src) ?? 'other';
  if (description) description = description[0].toUpperCase() + description.slice(1);

  return { amount, currency, description, category, paidBy, split, installments, date };
}
