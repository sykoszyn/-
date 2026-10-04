import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { demoGroup } from '@/domain/demo';
import { newId } from '@/domain/id';
import type { Bill, Budget, Expense, Goal, GoalContribution, Group, Member, Settlement } from '@/domain/types';
import { track, type Change } from '@/sync/outbox';
import type { Outbox } from '@/sync/types';

type Draft<T extends { id: string; createdAt: number }> = Omit<T, 'id' | 'createdAt'>;

type State = {
  groups: Record<string, Group>;
  activeGroupId: string | null;
  /** Cambios de grupos sincronizados que todavía no se subieron. */
  outbox: Outbox;

  createGroup: (group: Omit<Group, 'id' | 'createdAt' | 'expenses' | 'settlements' | 'bills' | 'goals'>) => string;
  loadDemo: () => void;
  switchGroup: (id: string) => void;
  deleteGroup: (id: string) => void;
  updateGroup: (patch: Partial<Pick<Group, 'name' | 'usdRate' | 'meId'>>) => void;
  updateMember: (id: string, patch: Partial<Member>) => void;
  addMember: (member: Member) => void;

  saveExpense: (expense: Draft<Expense> & { id?: string }) => string;
  deleteExpense: (id: string) => void;
  addSettlement: (settlement: Draft<Settlement>) => void;
  deleteSettlement: (id: string) => void;

  saveBill: (bill: Draft<Bill> & { id?: string }) => void;
  deleteBill: (id: string) => void;

  saveGoal: (goal: Omit<Draft<Goal>, 'contributions'> & { id?: string }) => string;
  deleteGoal: (id: string) => void;
  contribute: (goalId: string, contribution: Omit<GoalContribution, 'id'>) => void;

  saveBudget: (budget: Draft<Budget> & { id?: string }) => void;
  deleteBudget: (id: string) => void;

  /** Uso del plan gratis en este dispositivo (cargas por voz del mes). */
  usage: { month: string; voice: number };
  countVoice: (month: string) => void;
};

export const useStore = create<State>()(
  persist(
    (set, get) => {
      /** Aplica un cambio inmutable al grupo activo y, si está en la nube, anota qué subir. */
      const mutate = (fn: (g: Group) => Group, changes: Change[] = []) => {
        const { activeGroupId, groups, outbox } = get();
        if (!activeGroupId || !groups[activeGroupId]) return;
        const group = fn(groups[activeGroupId]);
        set({ groups: { ...groups, [activeGroupId]: group }, outbox: track(outbox, group, changes) });
      };

      return {
        groups: {},
        activeGroupId: null,
        outbox: {},
        usage: { month: '', voice: 0 },
        countVoice: (month) =>
          set((s) => ({ usage: { month, voice: s.usage.month === month ? s.usage.voice + 1 : 1 } })),

        createGroup: (data) => {
          const id = newId();
          const group: Group = { ...data, id, createdAt: Date.now(), expenses: [], settlements: [], bills: [], goals: [] };
          set((s) => ({ groups: { ...s.groups, [id]: group }, activeGroupId: id }));
          return id;
        },
        loadDemo: () => {
          const group = demoGroup();
          set((s) => ({ groups: { ...s.groups, [group.id]: group }, activeGroupId: group.id }));
        },
        switchGroup: (id) => set({ activeGroupId: id }),
        deleteGroup: (id) =>
          set((s) => {
            const groups = { ...s.groups };
            delete groups[id];
            const activeGroupId = s.activeGroupId === id ? (Object.keys(groups)[0] ?? null) : s.activeGroupId;
            const outbox = Object.fromEntries(Object.entries(s.outbox).filter(([, op]) => op.groupId !== id));
            return { groups, activeGroupId, outbox };
          }),
        updateGroup: (patch) =>
          mutate((g) => ({ ...g, ...patch }), 'name' in patch || 'usdRate' in patch ? [['groups', get().activeGroupId!]] : []),
        updateMember: (id, patch) =>
          mutate((g) => ({ ...g, members: g.members.map((m) => (m.id === id ? { ...m, ...patch } : m)) }), [['members', id]]),
        addMember: (member) => mutate((g) => ({ ...g, members: [...g.members, member] }), [['members', member.id]]),

        saveExpense: ({ id, ...data }) => {
          const expenseId = id ?? newId();
          mutate((g) => {
            const existing = g.expenses.find((e) => e.id === expenseId);
            const expense: Expense = { ...data, id: expenseId, createdAt: existing?.createdAt ?? Date.now() };
            return {
              ...g,
              expenses: existing
                ? g.expenses.map((e) => (e.id === expenseId ? expense : e))
                : [...g.expenses, expense],
            };
          }, [['expenses', expenseId]]);
          return expenseId;
        },
        deleteExpense: (id) => mutate((g) => ({ ...g, expenses: g.expenses.filter((e) => e.id !== id) }), [['expenses', id, true]]),
        addSettlement: (data) => {
          const id = newId();
          mutate((g) => ({ ...g, settlements: [...g.settlements, { ...data, id, createdAt: Date.now() }] }), [['settlements', id]]);
        },
        deleteSettlement: (id) =>
          mutate((g) => ({ ...g, settlements: g.settlements.filter((s) => s.id !== id) }), [['settlements', id, true]]),

        saveBill: ({ id, ...data }) => {
          const billId = id ?? newId();
          mutate((g) => {
            const existing = g.bills.find((b) => b.id === billId);
            const bill: Bill = { ...data, id: billId, createdAt: existing?.createdAt ?? Date.now() };
            return { ...g, bills: existing ? g.bills.map((b) => (b.id === billId ? bill : b)) : [...g.bills, bill] };
          }, [['bills', billId]]);
        },
        deleteBill: (id) => mutate((g) => ({ ...g, bills: g.bills.filter((b) => b.id !== id) }), [['bills', id, true]]),

        saveGoal: ({ id, ...data }) => {
          const goalId = id ?? newId();
          mutate((g) => {
            const existing = g.goals.find((x) => x.id === goalId);
            const goal: Goal = {
              ...data,
              id: goalId,
              contributions: existing?.contributions ?? [],
              createdAt: existing?.createdAt ?? Date.now(),
            };
            return { ...g, goals: existing ? g.goals.map((x) => (x.id === goalId ? goal : x)) : [...g.goals, goal] };
          }, [['goals', goalId]]);
          return goalId;
        },
        deleteGoal: (id) => mutate((g) => ({ ...g, goals: g.goals.filter((x) => x.id !== id) }), [['goals', id, true]]),
        saveBudget: ({ id, ...data }) => {
          const budgetId = id ?? newId();
          mutate((g) => {
            const list = g.budgets ?? [];
            const existing = list.find((b) => b.id === budgetId);
            const budget: Budget = { ...data, id: budgetId, createdAt: existing?.createdAt ?? Date.now() };
            return { ...g, budgets: existing ? list.map((b) => (b.id === budgetId ? budget : b)) : [...list, budget] };
          }, [['budgets', budgetId]]);
        },
        deleteBudget: (id) =>
          mutate((g) => ({ ...g, budgets: (g.budgets ?? []).filter((b) => b.id !== id) }), [['budgets', id, true]]),
        contribute: (goalId, contribution) => {
          const id = newId();
          mutate(
            (g) => ({
              ...g,
              goals: g.goals.map((x) => (x.id === goalId ? { ...x, contributions: [...x.contributions, { ...contribution, id }] } : x)),
            }),
            [['goal_contributions', id]],
          );
        },
      };
    },
    {
      name: 'parejo-v1',
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ groups: s.groups, activeGroupId: s.activeGroupId, outbox: s.outbox, usage: s.usage }),
      // v1 → v2: aparece la cola de cambios para sincronizar.
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<State>;
        if (version < 2) return { ...state, outbox: {} } as State;
        return state as State;
      },
    },
  ),
);

/** El grupo activo. Las pantallas dentro de las tabs pueden asumir que existe. */
export function useGroup(): Group {
  const group = useStore((s) => (s.activeGroupId ? s.groups[s.activeGroupId] : undefined));
  if (!group) throw new Error('No hay un grupo activo');
  return group;
}

export function useMaybeGroup(): Group | undefined {
  return useStore((s) => (s.activeGroupId ? s.groups[s.activeGroupId] : undefined));
}

/** `true` cuando ya se leyó lo guardado en el dispositivo. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    (onChange) => useStore.persist.onFinishHydration(onChange),
    () => useStore.persist.hasHydrated(),
    () => false,
  );
}
