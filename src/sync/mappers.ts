import type { Bill, Currency, Expense, Goal, GoalContribution, Group, GroupKind, Member, Settlement, Split } from '@/domain/types';

import type { Row, Table } from './types';

/** Convierte lo local a filas de Supabase y viceversa. Sin efectos: fácil de testear. */

const time = (iso: unknown) => (typeof iso === 'string' ? Date.parse(iso) || Date.now() : Date.now());
const opt = <T>(v: unknown) => (v === null || v === undefined ? undefined : (v as T));

export function groupToRow(g: Group): Row {
  return { id: g.id, name: g.name, kind: g.kind, currency: g.currency, usd_rate: g.usdRate };
}

export function memberToRow(m: Member, groupId: string): Row {
  // user_id nunca se manda: solo lo asigna el servidor (create_group / accept_invite).
  return { id: m.id, group_id: groupId, name: m.name, emoji: m.emoji, color: m.color, income: m.income ?? null, alias: m.alias ?? null };
}

export function expenseToRow(e: Expense, groupId: string): Row {
  return {
    id: e.id,
    group_id: groupId,
    description: e.description,
    amount: e.amount,
    currency: e.currency,
    rate: e.rate,
    paid_by: e.paidBy,
    split: e.split,
    category: e.category,
    date: e.date,
    installments: e.installments,
    bill_id: e.billId ?? null,
  };
}

export function settlementToRow(s: Settlement, groupId: string): Row {
  return { id: s.id, group_id: groupId, from_member: s.from, to_member: s.to, amount: s.amount, date: s.date, note: s.note ?? null };
}

export function billToRow(b: Bill, groupId: string): Row {
  return {
    id: b.id,
    group_id: groupId,
    name: b.name,
    emoji: b.emoji,
    amount: b.amount,
    due_day: b.dueDay,
    category: b.category,
    split: b.split,
    payer_id: b.payerId ?? null,
    active: b.active,
  };
}

export function goalToRow(g: Goal, groupId: string): Row {
  return { id: g.id, group_id: groupId, name: g.name, emoji: g.emoji, target: g.target, currency: g.currency, deadline: g.deadline ?? null };
}

export function contributionToRow(c: GoalContribution, goalId: string, groupId: string): Row {
  return { id: c.id, goal_id: goalId, group_id: groupId, member_id: c.memberId, amount: c.amount, date: c.date };
}

export function rowToMember(r: Row): Member {
  return {
    id: r.id,
    name: String(r.name),
    emoji: String(r.emoji),
    color: String(r.color),
    income: opt<number>(r.income) !== undefined ? Number(r.income) : undefined,
    alias: opt<string>(r.alias),
    userId: opt<string>(r.user_id),
  };
}

export function rowToExpense(r: Row): Expense {
  return {
    id: r.id,
    description: String(r.description),
    amount: Number(r.amount),
    currency: r.currency as Currency,
    rate: Number(r.rate),
    paidBy: String(r.paid_by),
    split: r.split as Split,
    category: String(r.category),
    date: String(r.date),
    installments: Number(r.installments),
    billId: opt<string>(r.bill_id),
    createdAt: time(r.created_at),
  };
}

export function rowToSettlement(r: Row): Settlement {
  return {
    id: r.id,
    from: String(r.from_member),
    to: String(r.to_member),
    amount: Number(r.amount),
    date: String(r.date),
    note: opt<string>(r.note),
    createdAt: time(r.created_at),
  };
}

export function rowToBill(r: Row): Bill {
  return {
    id: r.id,
    name: String(r.name),
    emoji: String(r.emoji),
    amount: Number(r.amount),
    dueDay: Number(r.due_day),
    category: String(r.category),
    split: r.split as Split,
    payerId: opt<string>(r.payer_id),
    active: Boolean(r.active),
    createdAt: time(r.created_at),
  };
}

export function rowToGoal(r: Row, contributions: GoalContribution[] = []): Goal {
  return {
    id: r.id,
    name: String(r.name),
    emoji: String(r.emoji),
    target: Number(r.target),
    currency: r.currency as Currency,
    deadline: opt<string>(r.deadline),
    contributions,
    createdAt: time(r.created_at),
  };
}

export function rowToContribution(r: Row): GoalContribution {
  return { id: r.id, memberId: String(r.member_id), amount: Number(r.amount), date: String(r.date) };
}

export function applyGroupRow(g: Group, r: Row): Group {
  return { ...g, name: String(r.name), kind: r.kind as GroupKind, currency: r.currency as Currency, usdRate: Number(r.usd_rate) };
}

/** La fila actual de algo local, lista para subir. `null` si ya no existe. */
export function localRow(group: Group, table: Table, id: string): Row | null {
  switch (table) {
    case 'groups':
      return id === group.id ? groupToRow(group) : null;
    case 'members': {
      const m = group.members.find((x) => x.id === id);
      return m ? memberToRow(m, group.id) : null;
    }
    case 'expenses': {
      const e = group.expenses.find((x) => x.id === id);
      return e ? expenseToRow(e, group.id) : null;
    }
    case 'settlements': {
      const s = group.settlements.find((x) => x.id === id);
      return s ? settlementToRow(s, group.id) : null;
    }
    case 'bills': {
      const b = group.bills.find((x) => x.id === id);
      return b ? billToRow(b, group.id) : null;
    }
    case 'goals': {
      const g = group.goals.find((x) => x.id === id);
      return g ? goalToRow(g, group.id) : null;
    }
    case 'goal_contributions':
      for (const g of group.goals) {
        const c = g.contributions.find((x) => x.id === id);
        if (c) return contributionToRow(c, g.id, group.id);
      }
      return null;
  }
}

/** Todas las filas de un grupo, para subirlo entero la primera vez. */
export function groupRows(group: Group): Record<Table, Row[]> {
  return {
    groups: [groupToRow(group)],
    members: group.members.map((m) => memberToRow(m, group.id)),
    bills: group.bills.map((b) => billToRow(b, group.id)),
    goals: group.goals.map((g) => goalToRow(g, group.id)),
    expenses: group.expenses.map((e) => expenseToRow(e, group.id)),
    settlements: group.settlements.map((s) => settlementToRow(s, group.id)),
    goal_contributions: group.goals.flatMap((g) => g.contributions.map((c) => contributionToRow(c, g.id, group.id))),
  };
}
