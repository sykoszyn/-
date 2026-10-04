import { addMonths, monthDiff, monthOf } from './dates';
import { allocate } from './money';
import type { Expense, Group, Member, Split, Transfer } from './types';

/** Pesos de reparto de un `Split`. Si la división por ingresos no es posible, cae a partes iguales. */
export function splitWeights(split: Split, members: Member[]): Record<string, number> {
  const ids = members.map((m) => m.id);
  const equal = (subset: string[]) => Object.fromEntries(subset.map((id) => [id, 1]));
  switch (split.mode) {
    case 'equal': {
      const subset = split.memberIds?.filter((id) => ids.includes(id));
      return equal(subset && subset.length > 0 ? subset : ids);
    }
    case 'income': {
      if (members.some((m) => !m.income || m.income <= 0)) return equal(ids);
      return Object.fromEntries(members.map((m) => [m.id, m.income!]));
    }
    case 'custom': {
      const weights = Object.fromEntries(
        Object.entries(split.weights).filter(([id, w]) => ids.includes(id) && w > 0),
      );
      return Object.keys(weights).length > 0 ? weights : equal(ids);
    }
    case 'full':
      return ids.includes(split.memberId) ? { [split.memberId]: 1 } : equal(ids);
  }
}

/** Cuánto le corresponde a cada miembro de `amount` centavos según el `Split`. */
export function splitAmount(amount: number, split: Split, members: Member[]): Record<string, number> {
  return allocate(amount, splitWeights(split, members));
}

/** Total del gasto convertido a la moneda del grupo. */
export function expenseBaseAmount(expense: Expense): number {
  return Math.round(expense.amount * expense.rate);
}

export type Installment = {
  expense: Expense;
  /** 1-based. */
  number: number;
  month: string;
  /** Centavos en la moneda del grupo. */
  amount: number;
  shares: Record<string, number>;
};

/** Desglosa un gasto en sus cuotas mensuales, cada una ya repartida entre los miembros. */
export function installmentsOf(expense: Expense, members: Member[]): Installment[] {
  const count = Math.max(1, Math.floor(expense.installments));
  const total = expenseBaseAmount(expense);
  const weights = Object.fromEntries(Array.from({ length: count }, (_, i) => [String(i), 1]));
  const parts = allocate(total, weights);
  const start = monthOf(expense.date);
  return Array.from({ length: count }, (_, i) => {
    const amount = parts[String(i)] ?? 0;
    return {
      expense,
      number: i + 1,
      month: addMonths(start, i),
      amount,
      shares: splitAmount(amount, expense.split, members),
    };
  });
}

/** Todas las cuotas del grupo que caen en `month`. */
export function installmentsInMonth(group: Group, month: string): Installment[] {
  const result: Installment[] = [];
  for (const expense of group.expenses) {
    const offset = monthDiff(monthOf(expense.date), month);
    if (offset < 0 || offset >= Math.max(1, expense.installments)) continue;
    result.push(installmentsOf(expense, group.members)[offset]);
  }
  return result;
}

/**
 * Saldo neto de cada miembro hasta `asOfMonth` inclusive.
 * Positivo = le deben plata. Negativo = debe plata. La suma siempre da 0.
 * Las cuotas de meses futuros todavía no cuentan: se van sumando mes a mes.
 */
export function balances(group: Group, asOfMonth: string): Record<string, number> {
  const net: Record<string, number> = Object.fromEntries(group.members.map((m) => [m.id, 0]));
  const add = (id: string, cents: number) => {
    if (id in net) net[id] += cents;
  };
  for (const expense of group.expenses) {
    for (const inst of installmentsOf(expense, group.members)) {
      if (monthDiff(inst.month, asOfMonth) < 0) break;
      add(expense.paidBy, inst.amount);
      for (const [id, share] of Object.entries(inst.shares)) add(id, -share);
    }
  }
  for (const s of group.settlements) {
    add(s.from, s.amount);
    add(s.to, -s.amount);
  }
  return net;
}

/** Lo que todavía falta imputar de cuotas futuras (después de `asOfMonth`), por miembro. */
export function pendingInstallments(group: Group, asOfMonth: string) {
  let total = 0;
  const net: Record<string, number> = Object.fromEntries(group.members.map((m) => [m.id, 0]));
  let count = 0;
  for (const expense of group.expenses) {
    for (const inst of installmentsOf(expense, group.members)) {
      if (monthDiff(inst.month, asOfMonth) >= 0) continue;
      count++;
      total += inst.amount;
      if (expense.paidBy in net) net[expense.paidBy] += inst.amount;
      for (const [id, share] of Object.entries(inst.shares)) if (id in net) net[id] -= share;
    }
  }
  return { total, net, count };
}

/**
 * Minimiza la cantidad de transferencias necesarias para saldar todo
 * (empareja al que más debe con al que más le deben, en cada paso).
 */
export function simplifyDebts(net: Record<string, number>): Transfer[] {
  const creditors = Object.entries(net)
    .filter(([, v]) => v > 0)
    .map(([id, v]) => ({ id, v }));
  const debtors = Object.entries(net)
    .filter(([, v]) => v < 0)
    .map(([id, v]) => ({ id, v: -v }));
  const transfers: Transfer[] = [];
  while (creditors.length && debtors.length) {
    creditors.sort((a, b) => b.v - a.v);
    debtors.sort((a, b) => b.v - a.v);
    const c = creditors[0];
    const d = debtors[0];
    const amount = Math.min(c.v, d.v);
    if (amount > 0) transfers.push({ from: d.id, to: c.id, amount });
    c.v -= amount;
    d.v -= amount;
    if (c.v === 0) creditors.shift();
    if (d.v === 0) debtors.shift();
  }
  return transfers;
}

export function memberById(group: Group, id: string): Member | undefined {
  return group.members.find((m) => m.id === id);
}

/** Etiqueta corta de cómo se dividió un gasto, para listas. */
export function describeSplit(split: Split, group: Group): string {
  switch (split.mode) {
    case 'equal':
      if (split.memberIds && split.memberIds.length < group.members.length) {
        return `Entre ${split.memberIds.map((id) => memberById(group, id)?.name ?? '?').join(' y ')}`;
      }
      return group.members.length === 2 ? 'Mitad y mitad' : 'Partes iguales';
    case 'income':
      return 'Según ingresos';
    case 'custom':
      return 'Personalizado';
    case 'full':
      return `Todo de ${memberById(group, split.memberId)?.name ?? '?'}`;
  }
}
