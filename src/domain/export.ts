import { getCategory } from './categories';
import { currentMonth, monthLabel, monthOf } from './dates';
import { balances, describeSplit, expenseBaseAmount, installmentsOf, memberById, splitAmount } from './ledger';
import type { Group } from './types';
import type { Sheet } from './xlsx';

/** Todo el grupo en hojas de cálculo: gastos, cuotas, categorías por mes, pagos y saldo. */
export function groupSheets(group: Group, asOfMonth = currentMonth()): Sheet[] {
  const name = (id: string) => memberById(group, id)?.name ?? '?';
  const pesos = (cents: number) => Math.round(cents) / 100;
  const expenses = [...group.expenses].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);

  const gastos: Sheet = {
    name: 'Gastos',
    columns: [
      { header: 'Fecha', width: 12 },
      { header: 'Descripción', width: 28 },
      { header: 'Categoría', width: 16 },
      { header: 'Pagó', width: 12 },
      { header: 'Monto', width: 14, money: true },
      { header: 'Moneda', width: 8 },
      { header: 'Cotización', width: 11 },
      { header: `Total en ${group.currency}`, width: 16, money: true },
      { header: 'División', width: 18 },
      { header: 'Cuotas', width: 8 },
      { header: 'Etiquetas', width: 18 },
      ...group.members.map((m) => ({ header: `Le toca a ${m.name}`, width: 16, money: true })),
    ],
    rows: expenses.map((e) => {
      const total = expenseBaseAmount(e);
      const shares = splitAmount(total, e.split, group.members);
      return [
        e.date,
        e.description,
        getCategory(e.category).label,
        name(e.paidBy),
        pesos(e.amount),
        e.currency,
        e.currency === group.currency ? null : e.rate,
        pesos(total),
        describeSplit(e.split, group),
        e.installments,
        (e.tags ?? []).join(', ') || null,
        ...group.members.map((m) => pesos(shares[m.id] ?? 0)),
      ];
    }),
  };

  const cuotas: Sheet = {
    name: 'Cuotas por mes',
    columns: [
      { header: 'Mes', width: 16 },
      { header: 'Descripción', width: 28 },
      { header: 'Cuota', width: 10 },
      { header: 'Monto', width: 14, money: true },
      { header: 'Pagó', width: 12 },
      { header: 'Estado', width: 14 },
    ],
    rows: expenses
      .filter((e) => e.installments > 1)
      .flatMap((e) =>
        installmentsOf(e, group.members).map((i) => [
          monthLabel(i.month),
          e.description,
          `${i.number}/${e.installments}`,
          pesos(i.amount),
          name(e.paidBy),
          i.month <= asOfMonth ? 'Ya cuenta' : 'Pendiente',
        ]),
      )
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  };

  const byMonth = new Map<string, Map<string, number>>();
  for (const e of expenses) {
    for (const i of installmentsOf(e, group.members)) {
      if (i.month > asOfMonth) continue;
      const m = byMonth.get(i.month) ?? new Map<string, number>();
      m.set(e.category, (m.get(e.category) ?? 0) + i.amount);
      byMonth.set(i.month, m);
    }
  }
  const categorias: Sheet = {
    name: 'Categorías por mes',
    columns: [
      { header: 'Mes', width: 10 },
      { header: 'Categoría', width: 18 },
      { header: 'Total', width: 14, money: true },
    ],
    rows: [...byMonth.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .flatMap(([month, cats]) =>
        [...cats.entries()].sort((a, b) => b[1] - a[1]).map(([cat, amount]) => [month, getCategory(cat).label, pesos(amount)]),
      ),
  };

  const pagos: Sheet = {
    name: 'Pagos entre ustedes',
    columns: [
      { header: 'Fecha', width: 12 },
      { header: 'De', width: 12 },
      { header: 'A', width: 12 },
      { header: 'Monto', width: 14, money: true },
      { header: 'Nota', width: 24 },
    ],
    rows: [...group.settlements].sort((a, b) => a.date.localeCompare(b.date)).map((s) => [s.date, name(s.from), name(s.to), pesos(s.amount), s.note ?? null]),
  };

  const net = balances(group, asOfMonth);
  const saldo: Sheet = {
    name: 'Saldo',
    columns: [
      { header: 'Persona', width: 14 },
      { header: `Saldo a ${monthLabel(monthOf(`${asOfMonth}-01`))}`, width: 22, money: true },
      { header: 'Significa', width: 26 },
    ],
    rows: group.members.map((m) => [m.name, pesos(net[m.id] ?? 0), (net[m.id] ?? 0) > 0 ? 'Le deben' : (net[m.id] ?? 0) < 0 ? 'Debe' : 'Parejo']),
  };

  return [gastos, cuotas, categorias, pagos, saldo];
}
