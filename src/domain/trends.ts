import { getCategory } from './categories';
import { addMonths, daysInMonth, monthOf } from './dates';
import { billsForMonth } from './insights';
import { installmentsInMonth } from './ledger';
import type { Group } from './types';

export type MonthTotal = { month: string; total: number; fixed: number; installments: number };

/** Total de cada uno de los últimos `count` meses (hasta `endMonth` inclusive), separando fijos y cuotas viejas. */
export function monthlyTotals(group: Group, endMonth: string, count = 6): MonthTotal[] {
  return Array.from({ length: count }, (_, i) => {
    const month = addMonths(endMonth, i - count + 1);
    let total = 0;
    let fixed = 0;
    let installments = 0;
    for (const inst of installmentsInMonth(group, month)) {
      total += inst.amount;
      if (inst.expense.billId) fixed += inst.amount;
      else if (inst.number > 1) installments += inst.amount;
    }
    return { month, total, fixed, installments };
  });
}

export type Projection = {
  spentSoFar: number;
  /** Gasto del día a día (sin fijos ni cuotas viejas) por día transcurrido. */
  dailyVariable: number;
  /** Fijos que todavía no se pagaron este mes (monto estimado). */
  pendingBills: number;
  projected: number;
};

/** Cómo termina el mes si siguen al mismo ritmo. */
export function projectMonth(group: Group, todayISO: string): Projection {
  const month = monthOf(todayISO);
  const day = Number(todayISO.slice(8, 10));
  const remainingDays = daysInMonth(month) - day;
  let spentSoFar = 0;
  let variable = 0;
  for (const inst of installmentsInMonth(group, month)) {
    spentSoFar += inst.amount;
    if (!inst.expense.billId && inst.number === 1 && inst.expense.date <= todayISO) variable += inst.amount;
  }
  const dailyVariable = Math.round(variable / Math.max(1, day));
  const pendingBills = billsForMonth(group, month, todayISO)
    .filter((b) => !b.paid)
    .reduce((a, b) => a + b.bill.amount, 0);
  return { spentSoFar, dailyVariable, pendingBills, projected: spentSoFar + dailyVariable * remainingDays + pendingBills };
}

/** Lo que ya está comprometido en cuotas para los próximos meses. */
export function committedInstallments(group: Group, fromMonth: string, count = 6): { month: string; amount: number }[] {
  return Array.from({ length: count }, (_, i) => {
    const month = addMonths(fromMonth, i + 1);
    const amount = installmentsInMonth(group, month).reduce((a, inst) => a + inst.amount, 0);
    return { month, amount };
  }).filter((m) => m.amount > 0);
}

export type CategoryTrend = { id: string; label: string; emoji: string; amount: number; average: number; delta: number | null };

/** Cada categoría del mes contra su promedio de los 3 meses anteriores. */
export function categoryTrends(group: Group, month: string): CategoryTrend[] {
  const sum = (m: string) => {
    const map = new Map<string, number>();
    for (const inst of installmentsInMonth(group, m)) map.set(inst.expense.category, (map.get(inst.expense.category) ?? 0) + inst.amount);
    return map;
  };
  const current = sum(month);
  const previous = [1, 2, 3].map((i) => sum(addMonths(month, -i)));
  const ids = new Set([...current.keys(), ...previous.flatMap((p) => [...p.keys()])]);
  return [...ids]
    .map((id) => {
      const amount = current.get(id) ?? 0;
      const average = Math.round(previous.reduce((a, p) => a + (p.get(id) ?? 0), 0) / 3);
      const c = getCategory(id);
      return { id, label: c.label, emoji: c.emoji, amount, average, delta: average > 0 ? (amount - average) / average : null };
    })
    .filter((c) => c.amount > 0 || c.average > 0)
    .sort((a, b) => b.amount - a.amount);
}

/** Dónde gastan más seguido (por descripción), en los últimos meses. */
export function frequentPlaces(group: Group, endMonth: string, months = 3, limit = 5): { name: string; count: number; total: number }[] {
  const from = addMonths(endMonth, -(months - 1));
  const map = new Map<string, { name: string; count: number; total: number }>();
  for (const e of group.expenses) {
    const m = monthOf(e.date);
    if (m < from || m > endMonth) continue;
    const key = e.description.trim().toLowerCase();
    const item = map.get(key) ?? { name: e.description.trim(), count: 0, total: 0 };
    item.count++;
    item.total += Math.round(e.amount * e.rate);
    map.set(key, item);
  }
  return [...map.values()].filter((x) => x.count > 1).sort((a, b) => b.count - a.count || b.total - a.total).slice(0, limit);
}
