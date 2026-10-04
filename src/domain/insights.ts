import { getCategory } from './categories';
import { addMonths, daysBetween, dueDate, monthOf } from './dates';
import { installmentsInMonth, splitWeights } from './ledger';
import type { Bill, Expense, Goal, Group } from './types';

export type MonthSummary = {
  month: string;
  total: number;
  previousTotal: number;
  byCategory: { id: string; label: string; emoji: string; color: string; amount: number }[];
  /** Cuánto puso de su bolsillo cada uno en el mes. */
  paidBy: Record<string, number>;
  /** Cuánto le correspondía a cada uno según cómo se dividió cada gasto. */
  consumedBy: Record<string, number>;
  /** De lo gastado, cuánto son cuotas de compras de meses anteriores. */
  fromInstallments: number;
  count: number;
  biggest?: { description: string; amount: number; category: string };
};

export function monthSummary(group: Group, month: string): MonthSummary {
  const installments = installmentsInMonth(group, month);
  const previousTotal = installmentsInMonth(group, addMonths(month, -1)).reduce((a, i) => a + i.amount, 0);
  const paidBy: Record<string, number> = Object.fromEntries(group.members.map((m) => [m.id, 0]));
  const consumedBy: Record<string, number> = Object.fromEntries(group.members.map((m) => [m.id, 0]));
  const categories = new Map<string, number>();
  let total = 0;
  let fromInstallments = 0;
  let biggest: MonthSummary['biggest'];
  for (const inst of installments) {
    total += inst.amount;
    if (inst.number > 1) fromInstallments += inst.amount;
    if (inst.expense.paidBy in paidBy) paidBy[inst.expense.paidBy] += inst.amount;
    for (const [id, share] of Object.entries(inst.shares)) if (id in consumedBy) consumedBy[id] += share;
    categories.set(inst.expense.category, (categories.get(inst.expense.category) ?? 0) + inst.amount);
    if (!biggest || inst.amount > biggest.amount) {
      biggest = { description: inst.expense.description, amount: inst.amount, category: inst.expense.category };
    }
  }
  const byCategory = [...categories.entries()]
    .map(([id, amount]) => ({ ...getCategory(id), id, amount }))
    .sort((a, b) => b.amount - a.amount);
  return {
    month,
    total,
    previousTotal,
    byCategory,
    paidBy,
    consumedBy,
    fromInstallments,
    count: installments.length,
    biggest,
  };
}

/** Lo que cada uno "debería" poner según la regla por defecto del grupo (iguales o por ingresos). */
export function fairShares(group: Group): Record<string, number> {
  const weights = splitWeights(
    group.members.every((m) => (m.income ?? 0) > 0) ? { mode: 'income' } : { mode: 'equal' },
    group.members,
  );
  const sum = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(Object.entries(weights).map(([id, w]) => [id, w / sum]));
}

export type BillStatus = {
  bill: Bill;
  due: string;
  /** Días hasta el vencimiento (negativo si ya venció). */
  daysLeft: number;
  paid?: Expense;
  state: 'paid' | 'overdue' | 'soon' | 'upcoming';
};

/** Estado de los fijos del mes: pagados, vencidos, por vencer. */
export function billsForMonth(group: Group, month: string, todayISO: string): BillStatus[] {
  return group.bills
    .filter((b) => b.active)
    .map((bill) => {
      const due = dueDate(month, bill.dueDay);
      const paid = group.expenses.find((e) => e.billId === bill.id && monthOf(e.date) === month);
      const daysLeft = daysBetween(todayISO, due);
      const state: BillStatus['state'] = paid
        ? 'paid'
        : daysLeft < 0
          ? 'overdue'
          : daysLeft <= 5
            ? 'soon'
            : 'upcoming';
      return { bill, due, daysLeft, paid, state };
    })
    .sort((a, b) => {
      const rank = { overdue: 0, soon: 1, upcoming: 2, paid: 3 };
      return rank[a.state] - rank[b.state] || a.due.localeCompare(b.due);
    });
}

export type GoalProgress = {
  goal: Goal;
  saved: number;
  ratio: number;
  byMember: Record<string, number>;
  /** Cuánto habría que ahorrar por mes para llegar a la fecha, si tiene fecha. */
  monthlyNeeded?: number;
  monthsLeft?: number;
};

export function goalProgress(goal: Goal, group: Group, todayISO: string): GoalProgress {
  const byMember: Record<string, number> = Object.fromEntries(group.members.map((m) => [m.id, 0]));
  let saved = 0;
  for (const c of goal.contributions) {
    saved += c.amount;
    if (c.memberId in byMember) byMember[c.memberId] += c.amount;
  }
  const ratio = goal.target > 0 ? Math.max(0, Math.min(1, saved / goal.target)) : 0;
  let monthlyNeeded: number | undefined;
  let monthsLeft: number | undefined;
  if (goal.deadline) {
    monthsLeft = Math.max(1, Math.ceil(daysBetween(todayISO, goal.deadline) / 30.44));
    monthlyNeeded = Math.max(0, Math.ceil((goal.target - saved) / monthsLeft));
  }
  return { goal, saved, ratio, byMember, monthlyNeeded, monthsLeft };
}
