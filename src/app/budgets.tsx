import { useState } from 'react';
import { View } from 'react-native';

import { budgetsForMonth } from '@/domain/budgets';
import { CATEGORIES } from '@/domain/categories';
import { currentMonth, monthLabel } from '@/domain/dates';
import { centsToInput, formatMoney, parseAmount } from '@/domain/money';
import { FREE_LIMITS, withinLimit } from '@/domain/plan';
import { BudgetBars } from '@/features/budget-bars';
import { usePlan } from '@/pro/client';
import { goPro } from '@/pro/gate';
import { useGroup, useStore } from '@/store';
import { confirm, EmptyState } from '@/ui/bits';
import { Button, ChipGroup, Field, Label } from '@/ui/controls';
import { Card, HStack, Screen, Section, VStack } from '@/ui/layout';
import { T } from '@/ui/text';
import { Space } from '@/ui/theme';

export default function Budgets() {
  const group = useGroup();
  const plan = usePlan(group);
  const { saveBudget, deleteBudget } = useStore.getState();
  const month = currentMonth();
  const statuses = budgetsForMonth(group, month);
  const budgets = group.budgets ?? [];
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [amountText, setAmountText] = useState('');
  const existing = budgets.find((b) => b.category === category);
  const amount = parseAmount(amountText) ?? 0;
  const free = CATEGORIES.filter((c) => !budgets.some((b) => b.category === c.id) || c.id === category);

  const pick = (id: string) => {
    setCategory(id);
    const b = budgets.find((x) => x.category === id);
    setAmountText(b ? centsToInput(b.amount) : '');
  };

  const save = () => {
    if (!category || amount <= 0) return;
    if (!existing && !withinLimit(plan, 'budgets', budgets.length)) return goPro('budgets');
    saveBudget({ id: existing?.id, category, amount });
    setCategory(undefined);
    setAmountText('');
  };

  return (
    <Screen safeTop={false}>
      <T tone="secondary">
        Pongan un tope por mes a lo que quieran cuidar. Cuentan los gastos de la categoría en {monthLabel(month, false)}, cuotas incluidas.
      </T>

      {statuses.length === 0 ? (
        <EmptyState emoji="🎯" title="Todavía no hay presupuestos" body="Por ejemplo: Súper $400.000, Delivery $60.000." />
      ) : (
        <Card>
          <BudgetBars statuses={statuses} currency={group.currency} onPress={(s) => pick(s.budget.category)} />
        </Card>
      )}

      <Section title={existing ? 'Editar presupuesto' : 'Nuevo presupuesto'}>
        <Card>
          <VStack gap={Space.md}>
            <Label>Categoría</Label>
            <ChipGroup options={free.map((c) => ({ value: c.id, label: c.label, icon: c.emoji }))} value={category} onChange={pick} />
            <Field label="Tope por mes" placeholder="Ej: 400.000" keyboardType="decimal-pad" inputMode="decimal" value={amountText} onChangeText={setAmountText} />
            <HStack wrap>
              <Button title={existing ? 'Guardar' : 'Agregar'} small disabled={!category || amount <= 0} onPress={save} />
              {existing && (
                <Button
                  title="Borrar"
                  small
                  variant="danger"
                  onPress={async () => {
                    if (await confirm('¿Borrar este presupuesto?', 'Los gastos no se tocan.')) {
                      deleteBudget(existing.id);
                      setCategory(undefined);
                      setAmountText('');
                    }
                  }}
                />
              )}
            </HStack>
            {plan.tier === 'free' && (
              <View>
                <T variant="caption" tone="secondary">
                  Plan gratis: hasta {FREE_LIMITS.budgets} presupuestos ({budgets.length} usados). Con Pro, sin tope.
                </T>
              </View>
            )}
          </VStack>
        </Card>
      </Section>

      {statuses.some((s) => s.state === 'over') && (
        <T variant="caption" tone="secondary" center>
          Se pasaron en {statuses.filter((s) => s.state === 'over').length} · total excedido{' '}
          {formatMoney(statuses.filter((s) => s.state === 'over').reduce((a, s) => a - s.remaining, 0), group.currency)}
        </T>
      )}
    </Screen>
  );
}
