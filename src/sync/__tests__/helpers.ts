import { currentMonth } from '@/domain/dates';
import { demoGroup } from '@/domain/demo';
import { newId } from '@/domain/id';
import type { Expense, Group } from '@/domain/types';

import type { SyncDeps, SyncState } from '../engine';
import { track, type Change } from '../outbox';
import type { Remote } from '../types';

/** Un "teléfono": estado local propio + su conexión al servidor. */
export function device(remote: Remote) {
  let state: SyncState = { groups: {}, activeGroupId: null, outbox: {} };
  const deps: SyncDeps = {
    remote,
    get: () => state,
    set: (fn) => {
      state = { ...state, ...fn(state) };
    },
  };
  return {
    deps,
    get state() {
      return state;
    },
    get group() {
      return state.groups[state.activeGroupId!];
    },
    add(group: Group) {
      state = { ...state, groups: { ...state.groups, [group.id]: group }, activeGroupId: group.id };
    },
    /** Igual que hace el store: cambia el grupo activo y anota el cambio para subir. */
    mutate(fn: (g: Group) => Group, changes: Change[]) {
      const g = fn(state.groups[state.activeGroupId!]);
      state = { ...state, groups: { ...state.groups, [g.id]: g }, outbox: track(state.outbox, g, changes) };
    },
  };
}

export function expense(group: Group, patch: Partial<Expense>): Expense {
  return {
    id: newId(),
    description: 'Súper',
    amount: 10_000_00,
    currency: 'ARS',
    rate: 1,
    paidBy: group.meId,
    split: { mode: 'equal' },
    category: 'super',
    date: `${currentMonth()}-01`,
    installments: 1,
    createdAt: Date.now(),
    ...patch,
  };
}

/** Un grupo creado con la versión anterior, con ids cortos. */
export function legacyGroup(): Group {
  const g = demoGroup();
  return {
    ...g,
    id: 'g1',
    meId: 'juli',
    members: [
      { ...g.members[0], id: 'juli' },
      { ...g.members[1], id: 'sofi' },
    ],
    expenses: [
      { ...g.expenses[0], id: 'e1', paidBy: 'juli', split: { mode: 'full', memberId: 'sofi' }, billId: 'b1', date: `${currentMonth()}-01` },
      { ...g.expenses[1], id: 'e2', paidBy: 'sofi', split: { mode: 'custom', weights: { juli: 70, sofi: 30 } }, billId: undefined, date: `${currentMonth()}-01` },
    ],
    bills: [{ ...g.bills[0], id: 'b1', payerId: 'sofi' }],
    settlements: [{ ...g.settlements[0], id: 's1', from: 'sofi', to: 'juli' }],
    goals: [{ ...g.goals[0], id: 'goal1', contributions: [{ id: 'c1', memberId: 'sofi', amount: 100, date: '2026-10-01' }] }],
  };
}
