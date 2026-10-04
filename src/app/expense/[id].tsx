import { router, Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet } from 'react-native';

import { getCategory } from '@/domain/categories';
import { currentMonth, monthDiff, monthLabel, shortDate } from '@/domain/dates';
import { describeSplit, expenseBaseAmount, installmentsOf, memberById, splitAmount } from '@/domain/ledger';
import { formatMoney } from '@/domain/money';
import { useGroup, useStore } from '@/store';
import { Avatar, confirm, EmptyState, Pill } from '@/ui/bits';
import { Button } from '@/ui/controls';
import { Card, HStack, Row, Screen, Section, VStack } from '@/ui/layout';
import { T } from '@/ui/text';
import { Space } from '@/ui/theme';

export default function ExpenseDetail() {
  const { id, created } = useLocalSearchParams<{ id: string; created?: string }>();
  const group = useGroup();
  const deleteExpense = useStore((s) => s.deleteExpense);
  const expense = group.expenses.find((e) => e.id === id);

  if (!expense) {
    return (
      <Screen safeTop={false}>
        <EmptyState emoji="🫥" title="Este gasto ya no existe" />
      </Screen>
    );
  }

  const category = getCategory(expense.category);
  const payer = memberById(group, expense.paidBy);
  const total = expenseBaseAmount(expense);
  const shares = splitAmount(total, expense.split, group.members);
  const installments = installmentsOf(expense, group.members);
  const month = currentMonth();
  const bill = expense.billId ? group.bills.find((b) => b.id === expense.billId) : undefined;

  const remove = async () => {
    if (await confirm('¿Borrar este gasto?', `"${expense.description}" va a dejar de contar en las cuentas.`)) {
      deleteExpense(expense.id);
      router.back();
    }
  };

  return (
    <Screen safeTop={false}>
      <Stack.Screen options={{ title: expense.description }} />
      {created && (
        <Card tone="primarySoft">
          <T bold>✅ ¡Listo! Ya está en las cuentas.</T>
          <HStack style={styles.mt}>
            <Button title="Cargar otro" small onPress={() => router.replace('/expense/new')} />
            <Button title="Ir al inicio" small variant="ghost" onPress={() => router.dismissTo('/')} />
          </HStack>
        </Card>
      )}

      <Card style={styles.center}>
        <T style={styles.emoji}>{category.emoji}</T>
        <T variant="heading" center>
          {expense.description}
        </T>
        <T variant="display" center>
          {formatMoney(expense.amount, expense.currency)}
        </T>
        {expense.currency !== group.currency && (
          <T tone="secondary" center>
            ≈ {formatMoney(total, group.currency)} (a {expense.rate} por dólar)
          </T>
        )}
        <HStack wrap style={styles.pills}>
          <Pill tone="primary" label={category.label} />
          <Pill tone="neutral" label={shortDate(expense.date)} />
          <Pill tone="neutral" label={describeSplit(expense.split, group)} />
          {expense.installments > 1 && <Pill tone="warning" label={`${expense.installments} cuotas`} />}
          {bill && <Pill tone="positive" label={`Fijo: ${bill.name}`} />}
          {expense.tags?.map((t) => (
            <Pill key={t} tone="primary" label={`#${t}`} />
          ))}
        </HStack>
      </Card>

      <Section title="Cómo se reparte">
        <Card>
          <VStack gap={Space.md}>
            <HStack>
              {payer && <Avatar member={payer} size={30} />}
              <T style={styles.flex}>
                Pagó <T bold>{expense.paidBy === group.meId ? 'vos' : payer?.name}</T>
              </T>
              <T bold>{formatMoney(total, group.currency)}</T>
            </HStack>
            {group.members.map((m) => (
              <HStack key={m.id}>
                <Avatar member={m} size={30} />
                <T style={styles.flex}>Le toca a {m.id === group.meId ? 'vos' : m.name}</T>
                <T tone="secondary">{formatMoney(shares[m.id] ?? 0, group.currency)}</T>
              </HStack>
            ))}
          </VStack>
        </Card>
      </Section>

      {installments.length > 1 && (
        <Section title="Cuotas">
          <Card>
            {installments.map((inst, i) => {
              const diff = monthDiff(inst.month, month);
              return (
                <Row
                  key={inst.number}
                  icon={diff >= 0 ? '✅' : '⏳'}
                  title={`Cuota ${inst.number} de ${installments.length}`}
                  subtitle={monthLabel(inst.month)}
                  right={formatMoney(inst.amount, group.currency)}
                  rightSub={diff > 0 ? 'ya cuenta' : diff === 0 ? 'este mes' : 'todavía no cuenta'}
                  last={i === installments.length - 1}
                />
              );
            })}
          </Card>
        </Section>
      )}

      <VStack>
        <Button title="Editar" variant="secondary" onPress={() => router.push({ pathname: '/expense/new', params: { id: expense.id } })} />
        <Button title="Borrar gasto" variant="danger" onPress={remove} />
      </VStack>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: Space.sm, paddingVertical: Space.xl },
  emoji: { fontSize: 44, lineHeight: 54 },
  pills: { justifyContent: 'center', marginTop: Space.sm },
  flex: { flex: 1 },
  mt: { marginTop: Space.md },
});
