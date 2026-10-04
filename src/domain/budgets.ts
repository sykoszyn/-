import { getCategory } from './categories';
import { installmentsInMonth } from './ledger';
import type { Budget, Group } from './types';

/** "#Vacaciones  2026 " → "vacaciones 2026" */
export function normalizeTag(raw: string): string {
  return raw
    .replace(/^#+/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 24);
}

/** Etiquetas usadas en el grupo, de la más usada a la menos. */
export function groupTags(group: Group): string[] {
  const counts = new Map<string, number>();
  for (const e of group.expenses) for (const t of e.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
}

export type BudgetStatus = {
  budget: Budget;
  label: string;
  emoji: string;
  color: string;
  spent: number;
  ratio: number;
  remaining: number;
  state: 'ok' | 'warning' | 'over';
};

/** Cuánto se gastó de cada presupuesto en el mes (cuotas incluidas), del más apretado al más holgado. */
export function budgetsForMonth(group: Group, month: string): BudgetStatus[] {
  const spentBy = new Map<string, number>();
  for (const inst of installmentsInMonth(group, month)) {
    spentBy.set(inst.expense.category, (spentBy.get(inst.expense.category) ?? 0) + inst.amount);
  }
  return (group.budgets ?? [])
    .map((budget) => {
      const spent = spentBy.get(budget.category) ?? 0;
      const ratio = budget.amount > 0 ? spent / budget.amount : 0;
      const c = getCategory(budget.category);
      return {
        budget,
        label: c.label,
        emoji: c.emoji,
        color: c.color,
        spent,
        ratio,
        remaining: budget.amount - spent,
        state: (ratio > 1 ? 'over' : ratio >= 0.8 ? 'warning' : 'ok') as BudgetStatus['state'],
      };
    })
    .sort((a, b) => b.ratio - a.ratio);
}

/** Total por etiqueta en el mes (o en todo el historial si `month` es null). */
export function tagTotals(group: Group, month: string | null): { tag: string; amount: number }[] {
  const totals = new Map<string, number>();
  const add = (tags: string[] | undefined, amount: number) => {
    for (const t of tags ?? []) totals.set(t, (totals.get(t) ?? 0) + amount);
  };
  if (month) for (const inst of installmentsInMonth(group, month)) add(inst.expense.tags, inst.amount);
  else for (const e of group.expenses) add(e.tags, Math.round(e.amount * e.rate));
  return [...totals.entries()].map(([tag, amount]) => ({ tag, amount })).sort((a, b) => b.amount - a.amount);
}
