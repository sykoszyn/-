import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { currentMonth, monthLabel, relativeDays, shortDate, today } from '@/domain/dates';
import { billsForMonth, type BillStatus } from '@/domain/insights';
import { expenseBaseAmount, memberById } from '@/domain/ledger';
import { formatMoney } from '@/domain/money';
import { useGroup } from '@/store';
import { EmptyState, Pill, ProgressBar } from '@/ui/bits';
import { Button } from '@/ui/controls';
import { Card, HStack, Row, Screen, Section, VStack } from '@/ui/layout';
import { T } from '@/ui/text';
import { Space, useTheme } from '@/ui/theme';

export default function Bills() {
  const group = useGroup();
  const theme = useTheme();
  const month = currentMonth();
  const todayISO = today();
  const statuses = billsForMonth(group, month, todayISO);
  const paid = statuses.filter((s) => s.paid);
  const expected = statuses.reduce((a, s) => a + (s.paid ? expenseBaseAmount(s.paid) : s.bill.amount), 0);
  const paidTotal = paid.reduce((a, s) => a + expenseBaseAmount(s.paid!), 0);
  const inactive = group.bills.filter((b) => !b.active);

  return (
    <Screen title="Fijos del mes" subtitle={monthLabel(month)} right={<Button title="＋" small onPress={() => router.push('/bill/edit')} />}>
      {statuses.length === 0 ? (
        <Card>
          <EmptyState
            emoji="📅"
            title="Sumá los gastos de todos los meses"
            body="Alquiler, expensas, luz, internet, streaming... Parejo te avisa qué vence y quién lo pagó, y lo suma a las cuentas en un toque."
          />
          <Button title="Agregar el primero" onPress={() => router.push('/bill/edit')} />
        </Card>
      ) : (
        <>
          <Card>
            <VStack>
              <HStack style={styles.between}>
                <T variant="label" tone="secondary">
                  {paid.length} de {statuses.length} pagos
                </T>
                <T variant="label" tone="secondary">
                  {formatMoney(paidTotal, group.currency)} / {formatMoney(expected, group.currency)}
                </T>
              </HStack>
              <ProgressBar ratio={statuses.length ? paid.length / statuses.length : 0} color={theme.positive} />
            </VStack>
          </Card>
          <Card>
            {statuses.map((s, i) => (
              <BillRow key={s.bill.id} status={s} last={i === statuses.length - 1} />
            ))}
          </Card>
          <T variant="caption" tone="secondary" center>
            Tocá un fijo pendiente para registrar el pago: se suma solo a las cuentas.
          </T>
        </>
      )}

      {inactive.length > 0 && (
        <Section title="Pausados">
          <Card>
            {inactive.map((b, i) => (
              <Row
                key={b.id}
                icon={b.emoji}
                title={b.name}
                subtitle="No se cuenta este mes"
                onPress={() => router.push({ pathname: '/bill/edit', params: { id: b.id } })}
                last={i === inactive.length - 1}
              />
            ))}
          </Card>
        </Section>
      )}
    </Screen>
  );
}

function BillRow({ status, last }: { status: BillStatus; last: boolean }) {
  const group = useGroup();
  const theme = useTheme();
  const todayISO = today();
  const { bill, paid, state } = status;
  const payer = paid ? memberById(group, paid.paidBy) : bill.payerId ? memberById(group, bill.payerId) : undefined;
  const pill =
    state === 'paid' ? (
      <Pill tone="positive" label={`✓ Pagó ${paid!.paidBy === group.meId ? 'vos' : payer?.name}`} />
    ) : state === 'overdue' ? (
      <Pill tone="negative" label={`Venció ${relativeDays(todayISO, status.due)}`} />
    ) : state === 'soon' ? (
      <Pill tone="warning" label={`Vence ${relativeDays(todayISO, status.due)}`} />
    ) : (
      <Pill tone="neutral" label={`Vence el ${shortDate(status.due)}`} />
    );

  const open = () =>
    paid
      ? router.push({ pathname: '/expense/[id]', params: { id: paid.id } })
      : router.push({ pathname: '/expense/new', params: { billId: bill.id } });

  return (
    <View style={[styles.billRow, !last && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <Row
        icon={bill.emoji}
        iconBg={state === 'paid' ? theme.positiveSoft : state === 'overdue' ? theme.negativeSoft : theme.cardAlt}
        title={bill.name}
        subtitle={!paid && payer ? `Suele pagar ${payer.id === group.meId ? 'vos' : payer.name}` : undefined}
        right={paid ? formatMoney(expenseBaseAmount(paid), group.currency) : bill.amount ? `~${formatMoney(bill.amount, group.currency)}` : 'Variable'}
        onPress={open}
        last
      />
      <HStack style={styles.billFooter}>
        {pill}
        <Button title="Editar" small variant="ghost" onPress={() => router.push({ pathname: '/bill/edit', params: { id: bill.id } })} style={styles.edit} />
      </HStack>
    </View>
  );
}

const styles = StyleSheet.create({
  between: { justifyContent: 'space-between' },
  billRow: { paddingBottom: Space.sm },
  billFooter: { justifyContent: 'space-between', marginLeft: 54, marginTop: -Space.sm },
  edit: { minHeight: 30, paddingHorizontal: Space.sm },
});
