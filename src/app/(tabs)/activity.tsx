import { router } from 'expo-router';
import { useMemo, useState } from 'react';

import { CATEGORIES, getCategory } from '@/domain/categories';
import { monthLabel, monthOf } from '@/domain/dates';
import { expenseBaseAmount } from '@/domain/ledger';
import { formatMoney } from '@/domain/money';
import type { Expense, Settlement } from '@/domain/types';
import { ExpenseRow, SettlementRow } from '@/features/expense-row';
import { useGroup } from '@/store';
import { EmptyState } from '@/ui/bits';
import { Button, Chip, Field } from '@/ui/controls';
import { Card, HStack, Screen, Section } from '@/ui/layout';
import { T } from '@/ui/text';

type Item = { kind: 'expense'; e: Expense; date: string; createdAt: number } | { kind: 'settlement'; s: Settlement; date: string; createdAt: number };

export default function Activity() {
  const group = useGroup();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);

  const months = useMemo(() => {
    const q = query.trim().toLowerCase();
    const items: Item[] = [
      ...group.expenses
        .filter((e) => (!category || e.category === category) && (!q || e.description.toLowerCase().includes(q) || getCategory(e.category).label.toLowerCase().includes(q)))
        .map((e) => ({ kind: 'expense' as const, e, date: e.date, createdAt: e.createdAt })),
      ...(category || q ? [] : group.settlements.map((s) => ({ kind: 'settlement' as const, s, date: s.date, createdAt: s.createdAt }))),
    ].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    const byMonth = new Map<string, Item[]>();
    for (const item of items) {
      const key = monthOf(item.date);
      byMonth.set(key, [...(byMonth.get(key) ?? []), item]);
    }
    return [...byMonth.entries()];
  }, [group, query, category]);

  const used = new Set(group.expenses.map((e) => e.category));

  return (
    <Screen title="Movimientos" right={<Button title="＋" small onPress={() => router.push('/expense/new')} />}>
      <Field placeholder="Buscar..." value={query} onChangeText={setQuery} accessibilityLabel="Buscar" />
      <HStack wrap>
        <Chip label="Todo" selected={!category} onPress={() => setCategory(null)} />
        {CATEGORIES.filter((c) => used.has(c.id)).map((c) => (
          <Chip key={c.id} label={c.label} icon={c.emoji} selected={category === c.id} onPress={() => setCategory(category === c.id ? null : c.id)} />
        ))}
      </HStack>

      {months.length === 0 && <EmptyState emoji="🔎" title="Nada por acá" body={query || category ? 'Probá con otra búsqueda.' : 'Cargá el primer gasto con el botón ＋.'} />}

      {months.map(([month, items]) => {
        const total = items.reduce((a, i) => a + (i.kind === 'expense' ? expenseBaseAmount(i.e) : 0), 0);
        return (
          <Section key={month} title={monthLabel(month)}>
            <T variant="caption" tone="secondary" style={{ marginTop: -6, paddingHorizontal: 4 }}>
              {formatMoney(total, group.currency)} en compras cargadas este mes
            </T>
            <Card>
              {items.map((item, i) =>
                item.kind === 'expense' ? (
                  <ExpenseRow key={item.e.id} expense={item.e} group={group} last={i === items.length - 1} />
                ) : (
                  <SettlementRow key={item.s.id} settlement={item.s} group={group} last={i === items.length - 1} onPress={() => router.push('/settle')} />
                ),
              )}
            </Card>
          </Section>
        );
      })}
    </Screen>
  );
}
