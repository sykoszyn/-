import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { shortDate, today } from '@/domain/dates';
import { fairShares, goalProgress } from '@/domain/insights';
import { memberById } from '@/domain/ledger';
import { formatMoney, parseAmount } from '@/domain/money';
import { useGroup, useStore } from '@/store';
import { Avatar, EmptyState, ProgressBar, success } from '@/ui/bits';
import { Button, Chip, Field } from '@/ui/controls';
import { Card, HStack, Row, Screen, Section, VStack } from '@/ui/layout';
import { T } from '@/ui/text';
import { Space, useTheme } from '@/ui/theme';

export default function GoalDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const group = useGroup();
  const theme = useTheme();
  const contribute = useStore((s) => s.contribute);
  const goal = group.goals.find((g) => g.id === id);
  const [memberId, setMemberId] = useState(group.meId);
  const [amountText, setAmountText] = useState('');
  const [withdraw, setWithdraw] = useState(false);

  if (!goal) {
    return (
      <Screen safeTop={false}>
        <EmptyState emoji="🫥" title="Esta meta ya no existe" />
      </Screen>
    );
  }

  const p = goalProgress(goal, group, today());
  const amount = parseAmount(amountText) ?? 0;
  const fair = fairShares(group);
  const history = [...goal.contributions].sort((a, b) => b.date.localeCompare(a.date));

  const add = () => {
    contribute(goal.id, { memberId, amount: withdraw ? -amount : amount, date: today() });
    setAmountText('');
    success();
  };

  return (
    <Screen safeTop={false}>
      <Stack.Screen
        options={{
          title: goal.name,
          headerRight: () => <Button title="Editar" small variant="ghost" onPress={() => router.push({ pathname: '/goal/edit', params: { id: goal.id } })} />,
        }}
      />
      <Card style={styles.center}>
        <T style={styles.emoji}>{goal.emoji}</T>
        <T variant="display" center>
          {formatMoney(p.saved, goal.currency)}
        </T>
        <T tone="secondary" center>
          de {formatMoney(goal.target, goal.currency)} · {Math.round(p.ratio * 100)}%
        </T>
        <ProgressBar ratio={p.ratio} color={theme.positive} height={14} />
        {p.ratio >= 1 ? (
          <T tone="positive" bold center>
            🎉 ¡Meta cumplida! Se merecen un brindis.
          </T>
        ) : (
          p.monthlyNeeded !== undefined && (
            <T center>
              Para llegar al <T bold>{shortDate(goal.deadline!)}</T> necesitan{' '}
              <T bold>{formatMoney(p.monthlyNeeded, goal.currency)}</T> por mes ({p.monthsLeft} {p.monthsLeft === 1 ? 'mes' : 'meses'}).
            </T>
          )
        )}
      </Card>

      <Section title="Quién aportó">
        <Card>
          <VStack gap={Space.md}>
            {group.members.map((m) => {
              const own = p.byMember[m.id] ?? 0;
              const suggested = p.monthlyNeeded !== undefined ? Math.round(p.monthlyNeeded * (fair[m.id] ?? 0)) : undefined;
              return (
                <VStack key={m.id} gap={4}>
                  <HStack>
                    <Avatar member={m} size={30} />
                    <T style={styles.flex}>{m.id === group.meId ? 'Vos' : m.name}</T>
                    <T bold>{formatMoney(own, goal.currency)}</T>
                  </HStack>
                  <ProgressBar ratio={p.saved > 0 ? own / p.saved : 0} color={m.color} height={6} />
                  {suggested !== undefined && p.ratio < 1 && (
                    <T variant="caption" tone="secondary">
                      Aporte sugerido: {formatMoney(suggested, goal.currency)}/mes
                    </T>
                  )}
                </VStack>
              );
            })}
          </VStack>
        </Card>
      </Section>

      <Section title={withdraw ? 'Sacar plata' : 'Sumar un aporte'}>
        <Card>
          <VStack gap={Space.md}>
            <HStack wrap>
              {group.members.map((m) => (
                <Chip key={m.id} label={m.name} icon={m.emoji} selected={memberId === m.id} onPress={() => setMemberId(m.id)} />
              ))}
            </HStack>
            <Field
              placeholder={goal.currency === 'USD' ? 'US$ 0' : '$ 0'}
              keyboardType="decimal-pad"
              inputMode="decimal"
              value={amountText}
              onChangeText={setAmountText}
              accessibilityLabel="Monto del aporte"
            />
            <HStack>
              <Button title={withdraw ? 'Registrar retiro' : 'Sumar aporte'} icon={withdraw ? '➖' : '💰'} disabled={amount <= 0} onPress={add} />
              <Button title={withdraw ? 'Mejor sumar' : 'Sacar plata'} small variant="ghost" onPress={() => setWithdraw(!withdraw)} />
            </HStack>
          </VStack>
        </Card>
      </Section>

      {history.length > 0 && (
        <Section title="Historial">
          <Card>
            {history.map((c, i) => {
              const m = memberById(group, c.memberId);
              return (
                <Row
                  key={c.id}
                  icon={m?.emoji ?? '❔'}
                  iconBg={(m?.color ?? '#999') + '22'}
                  title={c.amount >= 0 ? `Aporte de ${m?.name}` : `Retiro de ${m?.name}`}
                  subtitle={shortDate(c.date)}
                  right={formatMoney(c.amount, goal.currency, { sign: true })}
                  rightTone={c.amount >= 0 ? 'positive' : 'negative'}
                  last={i === history.length - 1}
                />
              );
            })}
          </Card>
        </Section>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'stretch', gap: Space.sm, paddingVertical: Space.xl },
  emoji: { fontSize: 48, lineHeight: 58, textAlign: 'center' },
  flex: { flex: 1 },
});
