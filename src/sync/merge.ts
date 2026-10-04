import { isUuid, newId } from '@/domain/id';
import type { Group, Split } from '@/domain/types';

import {
  applyGroupRow,
  rowToBill,
  rowToBudget,
  rowToContribution,
  rowToExpense,
  rowToGoal,
  rowToMember,
  rowToSettlement,
} from './mappers';
import { opKey, type Row, type Snapshot, type Table } from './types';

/**
 * Los grupos creados con versiones anteriores tienen ids cortos. Antes de subirlos
 * se pasan todos a UUID, actualizando cada referencia (quién pagó, divisiones, etc.).
 */
export function ensureUuids(group: Group): Group {
  const map = new Map<string, string>();
  const id = (old: string) => {
    if (isUuid(old)) return old;
    if (!map.has(old)) map.set(old, newId());
    return map.get(old)!;
  };
  const opt = (old?: string) => (old === undefined ? undefined : id(old));
  const split = (s: Split): Split => {
    switch (s.mode) {
      case 'equal':
        return s.memberIds ? { mode: 'equal', memberIds: s.memberIds.map(id) } : s;
      case 'custom':
        return { mode: 'custom', weights: Object.fromEntries(Object.entries(s.weights).map(([k, w]) => [id(k), w])) };
      case 'full':
        return { mode: 'full', memberId: id(s.memberId) };
      default:
        return s;
    }
  };
  return {
    ...group,
    id: id(group.id),
    meId: id(group.meId),
    members: group.members.map((m) => ({ ...m, id: id(m.id) })),
    expenses: group.expenses.map((e) => ({ ...e, id: id(e.id), paidBy: id(e.paidBy), split: split(e.split), billId: opt(e.billId) })),
    settlements: group.settlements.map((s) => ({ ...s, id: id(s.id), from: id(s.from), to: id(s.to) })),
    bills: group.bills.map((b) => ({ ...b, id: id(b.id), payerId: opt(b.payerId), split: split(b.split) })),
    budgets: group.budgets?.map((b) => ({ ...b, id: id(b.id) })),
    goals: group.goals.map((g) => ({
      ...g,
      id: id(g.id),
      contributions: g.contributions.map((c) => ({ ...c, id: id(c.id), memberId: id(c.memberId) })),
    })),
  };
}

/** Reemplaza o agrega por id, o saca si la fila viene borrada. */
function mergeList<T extends { id: string }>(list: T[], rows: Row[], toItem: (r: Row) => T, skip: (id: string) => boolean): T[] {
  if (rows.length === 0) return list;
  const byId = new Map(list.map((x) => [x.id, x]));
  for (const r of rows) {
    if (skip(r.id)) continue;
    if (r.deleted_at) byId.delete(r.id);
    else byId.set(r.id, toItem(r));
  }
  return [...byId.values()];
}

function latest(snapshot: Snapshot, previous: string | null): string | null {
  let max = previous;
  for (const rows of Object.values(snapshot)) {
    for (const r of rows) if (r.updated_at && (!max || r.updated_at > max)) max = r.updated_at;
  }
  return max;
}

/**
 * Aplica lo que vino del servidor sobre el grupo local.
 * - Lo que tiene cambios locales sin subir (`pending`) no se pisa: gana lo local hasta que se sube.
 * - `meId` pasa a ser el miembro vinculado a mi cuenta.
 * Si `base` no existe (grupo nuevo en este dispositivo), el snapshot tiene que traer la fila del grupo.
 */
export function applySnapshot(base: Group | undefined, snapshot: Snapshot, pending: Set<string>, userId: string | null): Group | undefined {
  const skip = (table: Table) => (id: string) => pending.has(opKey(table, id));
  const groupRow = snapshot.groups[0];
  let group: Group | undefined = base;
  if (!group) {
    if (!groupRow) return undefined;
    group = {
      id: groupRow.id,
      name: '',
      kind: 'couple',
      currency: 'ARS',
      usdRate: 1,
      members: [],
      meId: '',
      expenses: [],
      settlements: [],
      bills: [],
      goals: [],
      createdAt: Date.parse(String(groupRow.created_at)) || Date.now(),
      remote: { lastPulledAt: null },
    };
  }
  if (groupRow && !pending.has(opKey('groups', groupRow.id))) group = applyGroupRow(group, groupRow);

  // Los miembros no se borran, pero sí pueden desvincularse (user_id pasa a null).
  const members = mergeList(group.members, snapshot.members, rowToMember, skip('members'));

  let goals = mergeList(group.goals, snapshot.goals, (r) => rowToGoal(r, group!.goals.find((g) => g.id === r.id)?.contributions ?? []), skip('goals'));
  if (snapshot.goal_contributions.length > 0) {
    goals = goals.map((g) => {
      const rows = snapshot.goal_contributions.filter((r) => r.goal_id === g.id);
      return rows.length ? { ...g, contributions: mergeList(g.contributions, rows, rowToContribution, skip('goal_contributions')) } : g;
    });
  }

  const mine = userId ? members.find((m) => m.userId === userId) : undefined;
  return {
    ...group,
    members,
    meId: mine?.id ?? (group.meId || members[0]?.id || ''),
    bills: mergeList(group.bills, snapshot.bills, rowToBill, skip('bills')),
    budgets: mergeList(group.budgets ?? [], snapshot.budgets, rowToBudget, skip('budgets')),
    expenses: mergeList(group.expenses, snapshot.expenses, rowToExpense, skip('expenses')),
    settlements: mergeList(group.settlements, snapshot.settlements, rowToSettlement, skip('settlements')),
    goals,
    remote: { lastPulledAt: latest(snapshot, group.remote?.lastPulledAt ?? null) },
  };
}
