import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { tagTotals } from '@/domain/budgets';
import { currentMonth, monthLabel, today } from '@/domain/dates';
import { formatMoney } from '@/domain/money';
import { hasPlus } from '@/domain/plan';
import { categoryTrends, committedInstallments, frequentPlaces, monthlyTotals, projectMonth } from '@/domain/trends';
import { ExcelButton } from '@/features/excel-button';
import { HBar, MonthBars } from '@/features/month-bars';
import { usePlan } from '@/plus/client';
import { goPlus } from '@/plus/gate';
import { useGroup } from '@/store';
import { Pill } from '@/ui/bits';
import { Button } from '@/ui/controls';
import { Card, HStack, Screen, Section, VStack } from '@/ui/layout';
import { T } from '@/ui/text';
import { Space } from '@/ui/theme';

export default function Insights() {
  const group = useGroup();
  const plan = usePlan(group);
  const pro = hasPlus(plan);
  const month = currentMonth();
  const todayISO = today();
  const [selected, setSelected] = useState(month);

  const data = useMemo(() => {
    const totals = monthlyTotals(group, month, 6);
    // Promedio de los meses anteriores (el actual todavía no terminó).
    const withData = totals.filter((t) => t.total > 0 && t.month !== month);
    return {
      totals,
      average: withData.length ? Math.round(withData.reduce((a, t) => a + t.total, 0) / withData.length) : 0,
      projection: projectMonth(group, todayISO),
      committed: committedInstallments(group, month, 6),
      categories: categoryTrends(group, month).slice(0, 8),
      places: frequentPlaces(group, month),
      tags: tagTotals(group, null).slice(0, 6),
    };
  }, [group, month, todayISO]);

  const sel = data.totals.find((t) => t.month === selected) ?? data.totals[data.totals.length - 1];
  const maxCommitted = Math.max(1, ...data.committed.map((c) => c.amount));
  const maxTag = Math.max(1, ...data.tags.map((t) => t.amount));

  return (
    <Screen safeTop={false}>
      <Section title="Últimos 6 meses">
        <Card>
          <MonthBars data={data.totals.map((t) => ({ month: t.month, amount: t.total }))} currency={group.currency} onSelect={setSelected} />
          <VStack gap={4} style={styles.mt}>
            <T variant="label" tone="secondary">
              {data.average > 0
                ? `Promedio de los meses anteriores: ${formatMoney(data.average, group.currency)}`
                : 'Cuando tengan meses completos, acá van a ver su promedio.'}
            </T>
            {sel && sel.total > 0 && (
              <T variant="label" tone="secondary">
                En {monthLabel(sel.month, false)}: {formatMoney(sel.fixed, group.currency)} de fijos ·{' '}
                {formatMoney(sel.installments, group.currency)} de cuotas viejas ·{' '}
                {formatMoney(sel.total - sel.fixed - sel.installments, group.currency)} del día a día
              </T>
            )}
          </VStack>
        </Card>
      </Section>

      {!pro ? (
        <Card tone="primarySoft">
          <VStack gap={Space.md}>
            <T variant="heading">✨ El resto viene con Plus</T>
            <VStack gap={4}>
              <T>📅 Cómo terminan el mes si siguen a este ritmo</T>
              <T>💳 Cuánto tienen comprometido en cuotas los próximos meses</T>
              <T>📊 Cada categoría contra su promedio</T>
              <T>📍 Dónde gastan más seguido</T>
              <T>🏷️ Totales por etiqueta</T>
              <T>📥 Exportar todo a Excel</T>
            </VStack>
            <Button title={plan.canStartTrial ? 'Probar un mes gratis' : 'Ver Parejo Plus'} onPress={() => goPlus('insights')} />
          </VStack>
        </Card>
      ) : (
        <>
          <Section title={`Proyección de ${monthLabel(month, false)}`}>
            <Card>
              <T variant="label" tone="secondary">
                Si siguen a este ritmo, terminan el mes en
              </T>
              <T variant="title">{formatMoney(data.projection.projected, group.currency)}</T>
              <VStack gap={4} style={styles.mt}>
                <T variant="label" tone="secondary">
                  Llevan {formatMoney(data.projection.spentSoFar, group.currency)} · {formatMoney(data.projection.dailyVariable, group.currency)} por día en el día a día
                </T>
                {data.projection.pendingBills > 0 && (
                  <T variant="label" tone="secondary">
                    Faltan pagar fijos por ~{formatMoney(data.projection.pendingBills, group.currency)}
                  </T>
                )}
                {data.average > 0 && (
                  <T variant="label" tone={data.projection.projected > data.average * 1.1 ? 'warning' : 'secondary'}>
                    {data.projection.projected > data.average
                      ? `▲ ${Math.round((data.projection.projected / data.average - 1) * 100)}% sobre su promedio`
                      : `▼ ${Math.round((1 - data.projection.projected / data.average) * 100)}% bajo su promedio`}
                  </T>
                )}
              </VStack>
            </Card>
          </Section>

          <Section title="Cuotas comprometidas">
            <Card>
              {data.committed.length === 0 ? (
                <T tone="secondary">No tienen cuotas pendientes para los próximos meses. 🙌</T>
              ) : (
                <VStack gap={Space.md}>
                  {data.committed.map((c) => (
                    <VStack key={c.month} gap={4}>
                      <HStack style={styles.between}>
                        <T style={styles.capitalize}>{monthLabel(c.month)}</T>
                        <T bold>{formatMoney(c.amount, group.currency)}</T>
                      </HStack>
                      <HBar ratio={c.amount / maxCommitted} />
                    </VStack>
                  ))}
                </VStack>
              )}
            </Card>
          </Section>

          <Section title="Categorías contra su promedio">
            <Card>
              <VStack gap={Space.sm}>
                {data.categories.map((c) => (
                  <HStack key={c.id} style={styles.between}>
                    <View style={styles.flex}>
                      <T>
                        {c.emoji} {c.label}
                      </T>
                      <T variant="caption" tone="secondary">
                        Promedio {formatMoney(c.average, group.currency)}
                      </T>
                    </View>
                    <T bold>{formatMoney(c.amount, group.currency)}</T>
                    {c.delta !== null && Math.abs(c.delta) >= 0.1 && (
                      <Pill tone={c.delta > 0.2 ? 'warning' : c.delta < -0.2 ? 'positive' : 'neutral'} label={`${c.delta > 0 ? '▲' : '▼'} ${Math.round(Math.abs(c.delta) * 100)}%`} />
                    )}
                  </HStack>
                ))}
                <T variant="caption" tone="secondary">
                  {monthLabel(month, false)} hasta hoy contra el promedio de los 3 meses anteriores.
                </T>
              </VStack>
            </Card>
          </Section>

          {data.places.length > 0 && (
            <Section title="Dónde gastan más seguido">
              <Card>
                <VStack gap={Space.sm}>
                  {data.places.map((p) => (
                    <HStack key={p.name} style={styles.between}>
                      <T style={styles.flex}>{p.name}</T>
                      <T variant="label" tone="secondary">
                        {p.count} veces
                      </T>
                      <T bold>{formatMoney(p.total, group.currency)}</T>
                    </HStack>
                  ))}
                </VStack>
              </Card>
            </Section>
          )}

          {data.tags.length > 0 && (
            <Section title="Por etiqueta (todo el historial)">
              <Card>
                <VStack gap={Space.md}>
                  {data.tags.map((t) => (
                    <VStack key={t.tag} gap={4}>
                      <HStack style={styles.between}>
                        <T>#{t.tag}</T>
                        <T bold>{formatMoney(t.amount, group.currency)}</T>
                      </HStack>
                      <HBar ratio={t.amount / maxTag} />
                    </VStack>
                  ))}
                </VStack>
              </Card>
            </Section>
          )}
        </>
      )}

      <ExcelButton group={group} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  mt: { marginTop: Space.md },
  between: { justifyContent: 'space-between' },
  capitalize: { textTransform: 'capitalize' },
  flex: { flex: 1 },
});
