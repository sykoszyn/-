import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { router } from 'expo-router';

import { budgetsForMonth, tagTotals } from '@/domain/budgets';
import { addMonths, currentMonth, monthLabel } from '@/domain/dates';
import { monthSummary } from '@/domain/insights';
import { formatMoney } from '@/domain/money';
import { BudgetBars } from '@/features/budget-bars';
import { useGroup } from '@/store';
import { Button } from '@/ui/controls';
import { Avatar, EmptyState, Pill, ProgressBar } from '@/ui/bits';
import { Card, HStack, Screen, Section, VStack } from '@/ui/layout';
import { T } from '@/ui/text';
import { Radius, Space, useTheme } from '@/ui/theme';

export default function Summary() {
  const group = useGroup();
  const theme = useTheme();
  const [month, setMonth] = useState(currentMonth());
  const s = useMemo(() => monthSummary(group, month), [group, month]);
  const maxCategory = s.byCategory[0]?.amount ?? 1;
  const delta = s.previousTotal > 0 ? (s.total - s.previousTotal) / s.previousTotal : null;
  const isCurrent = month === currentMonth();
  const budgets = useMemo(() => budgetsForMonth(group, month), [group, month]);
  const tags = useMemo(() => tagTotals(group, month), [group, month]);

  // ¿Quién puso más de lo que le tocaba según cómo dividieron cada gasto?
  const verdict = useMemo(() => {
    if (s.total === 0 || group.members.length < 2) return null;
    const top = group.members
      .map((m) => ({ m, diff: (s.paidBy[m.id] ?? 0) - (s.consumedBy[m.id] ?? 0) }))
      .reduce((a, b) => (b.diff > a.diff ? b : a));
    if (top.diff < s.total * 0.05) return { emoji: '👌', text: 'Re parejo: cada uno puso más o menos lo que le tocaba.' };
    const me = top.m.id === group.meId;
    return {
      emoji: '💡',
      text: me
        ? `Vos pusiste ${formatMoney(top.diff, group.currency)} más de lo que te tocaba este mes. Eso es lo que las cuentas te devuelven al saldar.`
        : `${top.m.name} puso ${formatMoney(top.diff, group.currency)} más de lo que le tocaba este mes. Eso es lo que las cuentas le devuelven al saldar.`,
    };
  }, [s, group]);

  return (
    <Screen title="Resumen">
      <Card style={styles.switcher}>
        <Pressable accessibilityLabel="Mes anterior" hitSlop={12} onPress={() => setMonth(addMonths(month, -1))} style={[styles.arrow, { backgroundColor: theme.cardAlt }]}>
          <T variant="heading">‹</T>
        </Pressable>
        <T variant="heading" style={styles.capitalize}>
          {monthLabel(month)}
        </T>
        <Pressable
          accessibilityLabel="Mes siguiente"
          hitSlop={12}
          disabled={isCurrent}
          onPress={() => setMonth(addMonths(month, 1))}
          style={[styles.arrow, { backgroundColor: theme.cardAlt, opacity: isCurrent ? 0.3 : 1 }]}>
          <T variant="heading">›</T>
        </Pressable>
      </Card>

      {s.count === 0 ? (
        <EmptyState emoji="🌱" title="Sin gastos este mes" body="Cuando carguen gastos, acá van a ver en qué se fue la plata." />
      ) : (
        <>
          <Card tone="hero" style={styles.hero}>
            <T variant="label" tone="onHeroSecondary">
              Gastaron juntos
            </T>
            <T variant="display" tone="onHero">
              {formatMoney(s.total, group.currency)}
            </T>
            {delta !== null && (
              <T variant="label" tone="onHeroSecondary">
                {delta >= 0 ? '▲' : '▼'} {Math.abs(Math.round(delta * 100))}% vs {monthLabel(addMonths(month, -1), false)} ({formatMoney(s.previousTotal, group.currency)})
              </T>
            )}
            {s.fromInstallments > 0 && (
              <T variant="caption" tone="onHeroSecondary">
                💳 {formatMoney(s.fromInstallments, group.currency)} son cuotas de compras de meses anteriores.
              </T>
            )}
          </Card>

          <Section title="Quién puso cuánto">
            <Card>
              <VStack gap={Space.md}>
                {group.members.map((m) => {
                  const paid = s.paidBy[m.id] ?? 0;
                  const consumed = s.consumedBy[m.id] ?? 0;
                  return (
                    <VStack key={m.id} gap={6}>
                      <HStack>
                        <Avatar member={m} size={30} />
                        <T style={styles.flex} bold>
                          {m.id === group.meId ? 'Vos' : m.name}
                        </T>
                        <T bold>{formatMoney(paid, group.currency)}</T>
                      </HStack>
                      <ProgressBar ratio={s.total ? paid / s.total : 0} color={m.color} />
                      <T variant="caption" tone="secondary">
                        {m.id === group.meId ? 'Te' : 'Le'} tocaba {formatMoney(consumed, group.currency)} según cómo dividieron cada gasto
                      </T>
                    </VStack>
                  );
                })}
                {verdict && (
                  <View style={[styles.verdict, { backgroundColor: theme.cardAlt }]}>
                    <T>
                      {verdict.emoji} {verdict.text}
                    </T>
                  </View>
                )}
              </VStack>
            </Card>
          </Section>

          <Section title="Presupuestos" action={budgets.length ? 'Editar' : undefined} href="/budgets">
            <Card>
              {budgets.length ? (
                <BudgetBars statuses={budgets} currency={group.currency} />
              ) : (
                <VStack>
                  <T tone="secondary">Pongan un tope por mes a lo que quieran cuidar (súper, delivery, salidas…).</T>
                  <Button title="Crear un presupuesto" small variant="secondary" onPress={() => router.push('/budgets')} style={styles.start} />
                </VStack>
              )}
            </Card>
          </Section>

          <Section title="En qué se fue">
            <Card>
              <VStack gap={Space.md}>
                {s.byCategory.map((c) => (
                  <VStack key={c.id} gap={6}>
                    <HStack>
                      <T style={styles.flex}>
                        {c.emoji} {c.label}
                      </T>
                      <T variant="label" tone="secondary">
                        {Math.round((c.amount / s.total) * 100)}%
                      </T>
                      <T bold style={styles.amount}>
                        {formatMoney(c.amount, group.currency)}
                      </T>
                    </HStack>
                    <ProgressBar ratio={c.amount / maxCategory} color={c.color} height={8} />
                  </VStack>
                ))}
              </VStack>
            </Card>
          </Section>

          {tags.length > 0 && (
            <Section title="Por etiqueta">
              <Card>
                <VStack gap={Space.sm}>
                  {tags.map((t) => (
                    <HStack key={t.tag} style={styles.between}>
                      <T>#{t.tag}</T>
                      <T bold>{formatMoney(t.amount, group.currency)}</T>
                    </HStack>
                  ))}
                </VStack>
              </Card>
            </Section>
          )}

          <Card tone="primarySoft" onPress={() => router.push('/insights')}>
            <HStack style={styles.between}>
              <View style={styles.flex}>
                <T bold>📈 Insights detallados</T>
                <T variant="label" tone="secondary">
                  Tendencia de 6 meses, proyección del mes, cuotas comprometidas y más.
                </T>
              </View>
              <T variant="heading" tone="primary">
                ›
              </T>
            </HStack>
          </Card>

          {s.biggest && (
            <Card>
              <HStack style={styles.between}>
                <View style={styles.flex}>
                  <T variant="caption" tone="secondary">
                    El gasto más grande
                  </T>
                  <T bold>{s.biggest.description}</T>
                </View>
                <Pill tone="primary" label={formatMoney(s.biggest.amount, group.currency)} />
              </HStack>
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  switcher: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Space.sm },
  arrow: { width: 40, height: 40, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  capitalize: { textTransform: 'capitalize' },
  hero: { gap: Space.sm, paddingVertical: Space.xl },
  flex: { flex: 1 },
  amount: { minWidth: 96, textAlign: 'right' },
  verdict: { padding: Space.md, borderRadius: Radius.md },
  between: { justifyContent: 'space-between' },
  start: { alignSelf: 'flex-start' },
});
