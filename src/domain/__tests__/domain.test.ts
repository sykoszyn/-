import { describe, expect, it } from 'vitest';

import { guessCategory } from '../categories';
import { addMonths, dueDate, monthDiff, relativeDays } from '../dates';
import { demoGroup } from '../demo';
import { billsForMonth, goalProgress, monthSummary } from '../insights';
import { balances, installmentsOf, pendingInstallments, simplifyDebts, splitAmount } from '../ledger';
import { allocate, formatMoney, parseAmount } from '../money';
import type { Expense, Group, Member } from '../types';

const juli: Member = { id: 'j', name: 'Juli', emoji: '🦊', color: '#000', income: 300 };
const sofi: Member = { id: 's', name: 'Sofi', emoji: '🐼', color: '#000', income: 100 };

function group(expenses: Partial<Expense>[], extra?: Partial<Group>): Group {
  return {
    id: 'g',
    name: 'Test',
    kind: 'couple',
    currency: 'ARS',
    members: [juli, sofi],
    meId: 'j',
    expenses: expenses.map((e, i) => ({
      id: `e${i}`,
      description: 'x',
      amount: 1000,
      currency: 'ARS',
      rate: 1,
      paidBy: 'j',
      split: { mode: 'equal' },
      category: 'other',
      date: '2026-10-01',
      installments: 1,
      createdAt: i,
      ...e,
    })),
    settlements: [],
    bills: [],
    goals: [],
    usdRate: 1000,
    createdAt: 0,
    ...extra,
  };
}

describe('money', () => {
  it('formats Argentine style', () => {
    expect(formatMoney(1230000)).toBe('$ 12.300');
    expect(formatMoney(125050, 'USD')).toBe('US$ 1.250,50');
    expect(formatMoney(-500)).toBe('-$ 5');
    expect(formatMoney(500, 'ARS', { sign: true })).toBe('+$ 5');
  });

  it('parses what people type', () => {
    expect(parseAmount('12300')).toBe(1230000);
    expect(parseAmount('12.300')).toBe(1230000);
    expect(parseAmount('1.234.567')).toBe(123456700);
    expect(parseAmount('12.300,50')).toBe(1230050);
    expect(parseAmount('12,5')).toBe(1250);
    expect(parseAmount('12.5')).toBe(1250);
    expect(parseAmount('1,234.56')).toBe(123456);
    expect(parseAmount('$ 1.000')).toBe(100000);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
  });

  it('allocates without losing cents', () => {
    const parts = allocate(1000, { a: 1, b: 1, c: 1 });
    expect(Object.values(parts).reduce((a, b) => a + b, 0)).toBe(1000);
    expect(parts).toEqual({ a: 334, b: 333, c: 333 });
    expect(allocate(-10, { a: 1, b: 1, c: 1 })).toEqual({ a: -4, b: -3, c: -3 });
    expect(allocate(100, {})).toEqual({});
  });
});

describe('dates', () => {
  it('handles month math across years', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(monthDiff('2026-11', '2027-02')).toBe(3);
  });

  it('clamps due dates to the month length', () => {
    expect(dueDate('2026-02', 31)).toBe('2026-02-28');
    expect(dueDate('2028-02', 30)).toBe('2028-02-29');
    expect(dueDate('2026-10', 5)).toBe('2026-10-05');
  });

  it('describes relative days', () => {
    expect(relativeDays('2026-10-04', '2026-10-04')).toBe('hoy');
    expect(relativeDays('2026-10-04', '2026-10-07')).toBe('en 3 días');
    expect(relativeDays('2026-10-04', '2026-10-02')).toBe('hace 2 días');
  });
});

describe('splits', () => {
  it('splits equally, by income, custom and full', () => {
    expect(splitAmount(1000, { mode: 'equal' }, [juli, sofi])).toEqual({ j: 500, s: 500 });
    expect(splitAmount(1000, { mode: 'income' }, [juli, sofi])).toEqual({ j: 750, s: 250 });
    expect(splitAmount(1000, { mode: 'custom', weights: { j: 60, s: 40 } }, [juli, sofi])).toEqual({ j: 600, s: 400 });
    expect(splitAmount(1000, { mode: 'full', memberId: 's' }, [juli, sofi])).toEqual({ s: 1000 });
  });

  it('falls back to equal when incomes are missing', () => {
    expect(splitAmount(1000, { mode: 'income' }, [juli, { ...sofi, income: undefined }])).toEqual({ j: 500, s: 500 });
  });
});

describe('balances', () => {
  it('who paid is owed the rest', () => {
    const g = group([{ amount: 10000, paidBy: 'j' }]);
    expect(balances(g, '2026-10')).toEqual({ j: 5000, s: -5000 });
    expect(simplifyDebts(balances(g, '2026-10'))).toEqual([{ from: 's', to: 'j', amount: 5000 }]);
  });

  it('settlements cancel debts', () => {
    const g = group([{ amount: 10000, paidBy: 'j' }], {
      settlements: [{ id: 'x', from: 's', to: 'j', amount: 5000, date: '2026-10-02', createdAt: 0 }],
    });
    expect(balances(g, '2026-10')).toEqual({ j: 0, s: 0 });
    expect(simplifyDebts(balances(g, '2026-10'))).toEqual([]);
  });

  it('installments are charged month by month', () => {
    const g = group([{ amount: 60000, installments: 3, date: '2026-10-15' }]);
    expect(installmentsOf(g.expenses[0], g.members).map((i) => [i.month, i.amount])).toEqual([
      ['2026-10', 20000],
      ['2026-11', 20000],
      ['2026-12', 20000],
    ]);
    expect(balances(g, '2026-10')).toEqual({ j: 10000, s: -10000 });
    expect(balances(g, '2026-12')).toEqual({ j: 30000, s: -30000 });
    expect(pendingInstallments(g, '2026-10')).toEqual({ total: 40000, net: { j: 20000, s: -20000 }, count: 2 });
  });

  it('converts dollars with the stored rate', () => {
    const g = group([{ amount: 10000, currency: 'USD', rate: 1200, paidBy: 's' }]);
    expect(balances(g, '2026-10')).toEqual({ j: -6000000, s: 6000000 });
  });

  it('always sums to zero, also in the demo group', () => {
    const g = demoGroup(new Date(2026, 9, 20));
    const net = balances(g, '2026-10');
    expect(Object.values(net).reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('minimizes transfers in bigger groups', () => {
    const transfers = simplifyDebts({ a: 3000, b: -1000, c: -1000, d: -1000, e: 0 });
    expect(transfers).toHaveLength(3);
    expect(transfers.every((t) => t.to === 'a' && t.amount === 1000)).toBe(true);
    expect(simplifyDebts({ a: 500, b: 500, c: -1000 })).toHaveLength(2);
  });
});

describe('insights', () => {
  it('summarizes a month', () => {
    const g = group([
      { amount: 10000, category: 'super', paidBy: 'j' },
      { amount: 30000, category: 'food', paidBy: 's', split: { mode: 'income' } },
      { amount: 20000, category: 'home', installments: 2, date: '2026-09-01' },
    ]);
    const s = monthSummary(g, '2026-10');
    expect(s.total).toBe(10000 + 30000 + 10000);
    expect(s.fromInstallments).toBe(10000);
    expect(s.paidBy).toEqual({ j: 20000, s: 30000 });
    expect(s.consumedBy).toEqual({ j: 5000 + 22500 + 5000, s: 5000 + 7500 + 5000 });
    expect(s.byCategory[0].id).toBe('food');
    expect(s.previousTotal).toBe(10000);
  });

  it('tracks bills due this month', () => {
    const g = group([{ billId: 'rent', date: '2026-10-05' }], {
      bills: [
        { id: 'rent', name: 'Alquiler', emoji: '🏠', amount: 1, dueDay: 10, category: 'home', split: { mode: 'equal' }, active: true, createdAt: 0 },
        { id: 'luz', name: 'Luz', emoji: '💡', amount: 1, dueDay: 2, category: 'services', split: { mode: 'equal' }, active: true, createdAt: 0 },
        { id: 'gas', name: 'Gas', emoji: '🔥', amount: 1, dueDay: 7, category: 'services', split: { mode: 'equal' }, active: true, createdAt: 0 },
        { id: 'old', name: 'Old', emoji: '🔥', amount: 1, dueDay: 7, category: 'services', split: { mode: 'equal' }, active: false, createdAt: 0 },
      ],
    });
    const status = billsForMonth(g, '2026-10', '2026-10-04');
    expect(status.map((s) => [s.bill.id, s.state])).toEqual([
      ['luz', 'overdue'],
      ['gas', 'soon'],
      ['rent', 'paid'],
    ]);
  });

  it('computes goal progress and monthly pace', () => {
    const g = group([]);
    const p = goalProgress(
      {
        id: 'goal',
        name: 'Viaje',
        emoji: '🏖️',
        target: 100000,
        currency: 'USD',
        deadline: '2027-04-04',
        contributions: [
          { id: '1', memberId: 'j', amount: 30000, date: '2026-10-01' },
          { id: '2', memberId: 's', amount: 10000, date: '2026-10-01' },
        ],
        createdAt: 0,
      },
      g,
      '2026-10-04',
    );
    expect(p.saved).toBe(40000);
    expect(p.ratio).toBeCloseTo(0.4);
    expect(p.byMember).toEqual({ j: 30000, s: 10000 });
    expect(p.monthsLeft).toBe(6);
    expect(p.monthlyNeeded).toBe(10000);
  });

  it('guesses categories from descriptions', () => {
    expect(guessCategory('Súper Coto')).toBe('super');
    expect(guessCategory('Factura de luz Edenor')).toBe('services');
    expect(guessCategory('Uber al aeropuerto')).toBe('transport');
    expect(guessCategory('qwerty')).toBeNull();
  });
});
