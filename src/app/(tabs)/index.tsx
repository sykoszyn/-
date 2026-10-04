import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { budgetsForMonth } from '@/domain/budgets';
import { currentMonth, monthLabel, relativeDays, today } from '@/domain/dates';
import { billsForMonth, goalProgress, monthSummary } from '@/domain/insights';
import { balances, memberById, pendingInstallments, simplifyDebts } from '@/domain/ledger';
import { formatMoney } from '@/domain/money';
import { ExpenseRow, SettlementRow } from '@/features/expense-row';
import { balanceHeadline, reminderMessage } from '@/features/phrases';
import { useInvite } from '@/features/account';
import { InstallBanner } from '@/features/install-banner';
import { useMercadoPago } from '@/plus/mercadopago';
import { useGroup } from '@/store';
import { syncEnabled } from '@/sync/runtime';
import { Avatar, EmptyState, Pill, ProgressBar, shareText } from '@/ui/bits';
import { Button } from '@/ui/controls';
import { Card, HStack, Row, Screen, Section, VStack } from '@/ui/layout';
import { T } from '@/ui/text';
import { Space, useTheme } from '@/ui/theme';

export default function Home() {
  const group = useGroup();
  const theme = useTheme();
  const month = currentMonth();
  const todayISO = today();
  const me = memberById(group, group.meId);

  const data = useMemo(() => {
    const net = balances(group, month);
    const transfers = simplifyDebts(net);
    return {
      transfers,
      headline: balanceHeadline(group, transfers),
      pending: pendingInstallments(group, month),
      summary: monthSummary(group, month),
      bills: billsForMonth(group, month, todayISO),
      budgets: budgetsForMonth(group, month).filter((b) => b.state !== 'ok'),
      goals: group.goals.map((g) => goalProgress(g, group, todayISO)),
      recent: [
        ...group.expenses.map((e) => ({ kind: 'expense' as const, date: e.date, createdAt: e.createdAt, e })),
        ...group.settlements.map((s) => ({ kind: 'settlement' as const, date: s.date, createdAt: s.createdAt, s })),
      ]
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
        .slice(0, 5),
    };
  }, [group, month, todayISO]);

  const { headline, transfers } = data;
  const { invite, busy: inviting } = useInvite();
  const mpInbox = useMercadoPago((s) => s.inbox);
  const notInvited = group.members.find((m) => m.id !== group.meId && !m.userId);
  const myIncoming = transfers.find((t) => t.to === group.meId);
  const pendingBills = data.bills.filter((b) => b.state !== 'paid');
  const delta = data.summary.previousTotal > 0 ? (data.summary.total - data.summary.previousTotal) / data.summary.previousTotal : null;

  return (
    <Screen
      title={`Hola, ${me?.name ?? ''} 👋`}
      subtitle={group.name}
      right={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ajustes"
          hitSlop={10}
          onPress={() => router.push('/settings')}
          style={[styles.gear, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <T style={styles.gearIcon}>⚙️</T>
        </Pressable>
      }>
      {/* Saldo */}
      <Card tone="hero" style={styles.hero}>
        <HStack gap={4}>
          {group.members.slice(0, 5).map((m) => (
            <Avatar key={m.id} member={m} size={34} />
          ))}
        </HStack>
        <T variant="label" tone="onHeroSecondary">
          {headline.label}
        </T>
        {headline.amount !== undefined && (
          <T variant="display" tone="onHero" testID="balance-amount">
            {formatMoney(headline.amount, group.currency)}
          </T>
        )}
        {transfers.length > 0 && group.members.length > 2 && (
          <VStack gap={2}>
            {transfers.map((t, i) => (
              <T key={i} variant="label" tone="onHeroSecondary">
                {memberById(group, t.from)?.name} → {memberById(group, t.to)?.name}: {formatMoney(t.amount, group.currency)}
              </T>
            ))}
          </VStack>
        )}
        {data.pending.count > 0 && (
          <T variant="caption" tone="onHeroSecondary">
            💳 Quedan {formatMoney(data.pending.total, group.currency)} en {data.pending.count} cuotas futuras, que se van sumando solas cada mes.
          </T>
        )}
        <HStack style={styles.heroActions}>
          {transfers.length > 0 && <Button title="Saldar" icon="🤝" variant="onHero" small onPress={() => router.push('/settle')} />}
          {myIncoming && (
            <Button title="Recordar con onda" icon="💬" variant="onHero" small onPress={() => shareText(reminderMessage(group, myIncoming))} />
          )}
        </HStack>
      </Card>

      <HStack>
        <Button title="Cargar gasto" icon="＋" onPress={() => router.push('/expense/new')} style={styles.flex} />
        <Button title="Decilo" icon="🎙️" variant="secondary" onPress={() => router.push('/quick')} />
      </HStack>

      <InstallBanner />

      {mpInbox.length > 0 && (
        <Card tone="primarySoft" onPress={() => router.push('/inbox')}>
          <HStack style={styles.between}>
            <T bold>
              📥 {mpInbox.length === 1 ? '1 pago' : `${mpInbox.length} pagos`} de Mercado Pago para revisar
            </T>
            <T variant="heading" tone="primary">
              ›
            </T>
          </HStack>
        </Card>
      )}

      {syncEnabled && notInvited && (
        <Card tone="primarySoft">
          <VStack>
            <T bold>💌 {notInvited.name} todavía no ve estas cuentas</T>
            <T variant="label" tone="secondary">
              Mandale una invitación y carguen desde sus celulares: todo se sincroniza solo.
            </T>
            <Button title={`Invitar a ${notInvited.name}`} small loading={inviting} onPress={() => invite(group, notInvited)} style={styles.inviteButton} />
          </VStack>
        </Card>
      )}

      {/* Fijos */}
      {group.bills.length > 0 && (
        <Section title="Fijos del mes" action="Ver todos" href="/bills">
          <Card>
            {pendingBills.length === 0 ? (
              <T tone="positive" bold>
                ✅ Todos los fijos de {monthLabel(month, false)} están pagos.
              </T>
            ) : (
              pendingBills.slice(0, 3).map((b, i, arr) => (
                <Row
                  key={b.bill.id}
                  icon={b.bill.emoji}
                  title={b.bill.name}
                  subtitle={b.state === 'overdue' ? `Venció ${relativeDays(todayISO, b.due)}` : `Vence ${relativeDays(todayISO, b.due)}`}
                  right={b.bill.amount ? formatMoney(b.bill.amount, group.currency) : undefined}
                  rightSub={b.state === 'overdue' ? '⚠️ vencido' : b.state === 'soon' ? '⏰ ya viene' : undefined}
                  onPress={() => router.push({ pathname: '/expense/new', params: { billId: b.bill.id } })}
                  last={i === arr.length - 1}
                />
              ))
            )}
          </Card>
        </Section>
      )}

      {/* Presupuestos en riesgo */}
      {data.budgets.length > 0 && (
        <Card onPress={() => router.push('/budgets')}>
          <VStack gap={Space.xs}>
            {data.budgets.slice(0, 3).map((b) => (
              <T key={b.budget.id} tone={b.state === 'over' ? 'negative' : 'warning'} bold>
                {b.state === 'over' ? '🚨' : '⚠️'} {b.emoji} {b.label}:{' '}
                {b.state === 'over'
                  ? `se pasaron por ${formatMoney(-b.remaining, group.currency)}`
                  : `usaron el ${Math.round(b.ratio * 100)}% del presupuesto`}
              </T>
            ))}
          </VStack>
        </Card>
      )}

      {/* Mes */}
      <Section title={`En ${monthLabel(month, false)}`} action="Resumen" href="/summary">
        <Card>
          <HStack style={styles.between}>
            <View>
              <T variant="caption" tone="secondary">
                Gastaron juntos
              </T>
              <T variant="title">{formatMoney(data.summary.total, group.currency)}</T>
            </View>
            {delta !== null && (
              <Pill tone={delta > 0.05 ? 'warning' : delta < -0.05 ? 'positive' : 'neutral'} label={`${delta > 0 ? '▲' : '▼'} ${Math.abs(Math.round(delta * 100))}% vs mes pasado`} />
            )}
          </HStack>
          {data.summary.byCategory.length > 0 && (
            <T variant="label" tone="secondary" style={styles.mt}>
              Lo que más: {data.summary.byCategory[0].emoji} {data.summary.byCategory[0].label} ({formatMoney(data.summary.byCategory[0].amount, group.currency)})
            </T>
          )}
        </Card>
      </Section>

      {/* Metas */}
      {data.goals.length > 0 && (
        <Section title="Metas" action="Ver todas" href="/goals">
          {data.goals.slice(0, 2).map((p) => (
            <Card key={p.goal.id} onPress={() => router.push({ pathname: '/goal/[id]', params: { id: p.goal.id } })}>
              <VStack>
                <HStack style={styles.between}>
                  <T bold>
                    {p.goal.emoji} {p.goal.name}
                  </T>
                  <T variant="label" tone="secondary">
                    {Math.round(p.ratio * 100)}%
                  </T>
                </HStack>
                <ProgressBar ratio={p.ratio} color={theme.positive} />
                <T variant="caption" tone="secondary">
                  {formatMoney(p.saved, p.goal.currency)} de {formatMoney(p.goal.target, p.goal.currency)}
                </T>
              </VStack>
            </Card>
          ))}
        </Section>
      )}

      {/* Movimientos */}
      <Section title="Últimos movimientos" action="Ver todo" href="/activity">
        <Card>
          {data.recent.length === 0 ? (
            <EmptyState emoji="🧾" title="Todavía no hay gastos" body="Cargá el primero y Parejo empieza a hacer las cuentas." />
          ) : (
            data.recent.map((item, i, arr) =>
              item.kind === 'expense' ? (
                <ExpenseRow key={item.e.id} expense={item.e} group={group} last={i === arr.length - 1} />
              ) : (
                <SettlementRow key={item.s.id} settlement={item.s} group={group} last={i === arr.length - 1} />
              ),
            )
          )}
        </Card>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  gear: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  gearIcon: { fontSize: 20, lineHeight: 26 },
  hero: { gap: Space.sm, paddingVertical: Space.xl },
  heroActions: { marginTop: Space.sm, flexWrap: 'wrap' },
  between: { justifyContent: 'space-between' },
  mt: { marginTop: Space.sm },
  flex: { flex: 1 },
  inviteButton: { alignSelf: 'flex-start', marginTop: Space.xs },
});
