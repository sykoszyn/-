import { addMonths, dueDate, monthOf, toISODate } from './dates';
import { newId } from './id';
import type { Bill, Expense, Goal, Group, Member, Split } from './types';

export const MEMBER_COLORS = ['#5B4CF0', '#FF6B5B', '#2FB67C', '#F2A93B', '#3AA0E8', '#E8547A'];
export const MEMBER_EMOJIS = ['🦊', '🐼', '🐨', '🦁', '🐸', '🐙'];

export function makeMember(name: string, index: number, extra?: Partial<Member>): Member {
  return {
    id: newId(),
    name: name.trim(),
    emoji: MEMBER_EMOJIS[index % MEMBER_EMOJIS.length],
    color: MEMBER_COLORS[index % MEMBER_COLORS.length],
    ...extra,
  };
}

/** Grupo de ejemplo realista para probar la app sin cargar nada. */
export function demoGroup(now = new Date()): Group {
  const me = makeMember('Juli', 0, { income: 180_000_000, alias: 'juli.parejo.mp' });
  const sofi = makeMember('Sofi', 1, { income: 120_000_000, alias: 'sofi.parejo' });
  const members = [me, sofi];
  const thisMonth = monthOf(toISODate(now));
  const day = now.getDate();
  const at = (monthsAgo: number, d: number) => dueDate(addMonths(thisMonth, -monthsAgo), d);
  const half: Split = { mode: 'equal' };
  const byIncome: Split = { mode: 'income' };
  let created = now.getTime() - 1_000_000;

  const expense = (
    description: string,
    pesos: number,
    paidBy: Member,
    category: string,
    date: string,
    extra?: Partial<Expense>,
  ): Expense => ({
    id: newId(),
    description,
    amount: Math.round(pesos * 100),
    currency: 'ARS',
    rate: 1,
    paidBy: paidBy.id,
    split: half,
    category,
    date,
    installments: 1,
    createdAt: created++,
    ...extra,
  });

  const bill = (name: string, emoji: string, pesos: number, dueDay: number, category: string, payer: Member, split: Split = half): Bill => ({
    id: newId(),
    name,
    emoji,
    amount: pesos * 100,
    dueDay,
    category,
    split,
    payerId: payer.id,
    active: true,
    createdAt: created++,
  });

  const rent = bill('Alquiler', '🏠', 650_000, 10, 'home', me, byIncome);
  const expensas = bill('Expensas', '🏢', 95_000, 10, 'home', sofi, byIncome);
  const luz = bill('Luz', '💡', 38_000, 18, 'services', sofi);
  const internet = bill('Internet', '📶', 29_000, 22, 'services', me);
  const netflix = bill('Netflix', '📺', 12_500, 26, 'subscriptions', sofi);
  const bills = [rent, expensas, luz, internet, netflix];

  const expenses: Expense[] = [];
  // Meses anteriores: todos los fijos pagos.
  for (const monthsAgo of [2, 1]) {
    for (const b of bills) {
      expenses.push(
        expense(b.name, b.amount / 100, members.find((m) => m.id === b.payerId)!, b.category, at(monthsAgo, b.dueDay - 1), {
          billId: b.id,
          split: b.split,
        }),
      );
    }
  }
  expenses.push(
    expense('Heladera nueva', 1_440_000, me, 'home', at(2, 14), { installments: 6 }),
    expense('Súper del mes', 182_300, sofi, 'super', at(2, 5)),
    expense('Cena aniversario 🥂', 96_000, me, 'food', at(2, 21), { tags: ['aniversario'] }),
    expense('Súper', 164_800, me, 'super', at(1, 4)),
    expense('Farmacia', 23_400, sofi, 'health', at(1, 9)),
    expense('Airbnb en Mendoza', 0, sofi, 'travel', at(1, 12), { amount: 32_000, currency: 'USD', rate: 1_200, tags: ['mendoza'] }),
    expense('Veterinaria de Milo', 45_000, sofi, 'pets', at(1, 17)),
    expense('Rappi', 28_900, me, 'delivery', at(1, 23)),
    expense('Zapatillas de Sofi', 160_000, me, 'other', at(1, 27), { installments: 3, split: { mode: 'full', memberId: sofi.id } }),
  );
  // Este mes: algunos fijos pagos y gastos del día a día.
  if (day >= 9) {
    expenses.push(
      expense(rent.name, 650_000, me, 'home', at(0, 9), { billId: rent.id, split: byIncome }),
      expense(expensas.name, 97_500, sofi, 'home', at(0, 9), { billId: expensas.id, split: byIncome }),
    );
  }
  expenses.push(
    expense('Súper', 171_200, sofi, 'super', at(0, Math.max(1, Math.min(day, 3)))),
    expense('Verdulería', 18_600, me, 'super', at(0, Math.max(1, day - 1))),
    expense('Cine + pochoclos', 34_000, sofi, 'outings', at(0, Math.max(1, day))),
  );

  const goals: Goal[] = [
    {
      id: newId(),
      name: 'Viaje a Brasil',
      emoji: '🏖️',
      target: 2_400_00,
      currency: 'USD',
      deadline: dueDate(addMonths(thisMonth, 5), 15),
      contributions: [
        { id: newId(), memberId: me.id, amount: 600_00, date: at(2, 2) },
        { id: newId(), memberId: sofi.id, amount: 400_00, date: at(2, 3) },
        { id: newId(), memberId: me.id, amount: 300_00, date: at(1, 2) },
        { id: newId(), memberId: sofi.id, amount: 200_00, date: at(1, 3) },
      ],
      createdAt: created++,
    },
    {
      id: newId(),
      name: 'Fondo de emergencia',
      emoji: '🛟',
      target: 3_000_000_00,
      currency: 'ARS',
      contributions: [
        { id: newId(), memberId: me.id, amount: 500_000_00, date: at(2, 1) },
        { id: newId(), memberId: sofi.id, amount: 350_000_00, date: at(1, 1) },
      ],
      createdAt: created++,
    },
  ];

  return {
    id: newId(),
    name: 'Juli & Sofi',
    kind: 'couple',
    currency: 'ARS',
    members,
    meId: me.id,
    expenses,
    settlements: [
      { id: newId(), from: sofi.id, to: me.id, amount: 300_000_00, date: at(1, 1), note: 'Saldamos el mes', createdAt: created++ },
    ],
    bills,
    goals,
    budgets: [
      { id: newId(), category: 'super', amount: 380_000_00, createdAt: created++ },
      { id: newId(), category: 'outings', amount: 40_000_00, createdAt: created++ },
    ],
    usdRate: 1_200,
    createdAt: created++,
  };
}
