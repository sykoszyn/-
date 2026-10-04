import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { demoGroup } from '@/domain/demo';
import { newId } from '@/domain/id';
import type { Bill, Expense, Goal, GoalContribution, Group, Member, Settlement } from '@/domain/types';

type Draft<T extends { id: string; createdAt: number }> = Omit<T, 'id' | 'createdAt'>;

type State = {
  groups: Record<string, Group>;
  activeGroupId: string | null;

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
};

export const useStore = create<State>()(
  persist(
    (set, get) => {
      /** Aplica un cambio inmutable al grupo activo. */
      const mutate = (fn: (g: Group) => Group) => {
        const { activeGroupId, groups } = get();
        if (!activeGroupId || !groups[activeGroupId]) return;
        set({ groups: { ...groups, [activeGroupId]: fn(groups[activeGroupId]) } });
      };

      return {
        groups: {},
        activeGroupId: null,

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
            return { groups, activeGroupId };
          }),
        updateGroup: (patch) => mutate((g) => ({ ...g, ...patch })),
        updateMember: (id, patch) =>
          mutate((g) => ({ ...g, members: g.members.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
        addMember: (member) => mutate((g) => ({ ...g, members: [...g.members, member] })),

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
          });
          return expenseId;
        },
        deleteExpense: (id) => mutate((g) => ({ ...g, expenses: g.expenses.filter((e) => e.id !== id) })),
        addSettlement: (data) =>
          mutate((g) => ({ ...g, settlements: [...g.settlements, { ...data, id: newId(), createdAt: Date.now() }] })),
        deleteSettlement: (id) => mutate((g) => ({ ...g, settlements: g.settlements.filter((s) => s.id !== id) })),

        saveBill: ({ id, ...data }) =>
          mutate((g) => {
            const existing = g.bills.find((b) => b.id === id);
            const bill: Bill = { ...data, id: id ?? newId(), createdAt: existing?.createdAt ?? Date.now() };
            return { ...g, bills: existing ? g.bills.map((b) => (b.id === id ? bill : b)) : [...g.bills, bill] };
          }),
        deleteBill: (id) => mutate((g) => ({ ...g, bills: g.bills.filter((b) => b.id !== id) })),

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
          });
          return goalId;
        },
        deleteGoal: (id) => mutate((g) => ({ ...g, goals: g.goals.filter((x) => x.id !== id) })),
        contribute: (goalId, contribution) =>
          mutate((g) => ({
            ...g,
            goals: g.goals.map((x) =>
              x.id === goalId ? { ...x, contributions: [...x.contributions, { ...contribution, id: newId() }] } : x,
            ),
          })),
      };
    },
    {
      name: 'parejo-v1',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ groups: s.groups, activeGroupId: s.activeGroupId }),
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
