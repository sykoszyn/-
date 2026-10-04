import { router } from 'expo-router';

import { shortDate, today } from '@/domain/dates';
import { goalProgress } from '@/domain/insights';
import { formatMoney } from '@/domain/money';
import { useGroup } from '@/store';
import { EmptyState, StackedBar } from '@/ui/bits';
import { Button } from '@/ui/controls';
import { Card, HStack, Screen, VStack } from '@/ui/layout';
import { T } from '@/ui/text';
import { Space } from '@/ui/theme';

export default function Goals() {
  const group = useGroup();
  const todayISO = today();
  const goals = group.goals.map((g) => goalProgress(g, group, todayISO));

  return (
    <Screen title="Metas" subtitle="Lo que están construyendo juntos" right={<Button title="＋" small onPress={() => router.push('/goal/edit')} />}>
      {goals.length === 0 && (
        <Card>
          <EmptyState emoji="🎯" title="¿Para qué están ahorrando?" body="El viaje, la mudanza, un fondo para imprevistos... Pónganle nombre y vean cómo avanza." />
          <Button title="Crear una meta" onPress={() => router.push('/goal/edit')} />
        </Card>
      )}
      {goals.map((p) => (
        <Card key={p.goal.id} onPress={() => router.push({ pathname: '/goal/[id]', params: { id: p.goal.id } })}>
          <VStack gap={Space.md}>
            <HStack style={{ justifyContent: 'space-between' }}>
              <T variant="heading">
                {p.goal.emoji} {p.goal.name}
              </T>
              <T variant="heading" tone={p.ratio >= 1 ? 'positive' : 'primary'}>
                {Math.round(p.ratio * 100)}%
              </T>
            </HStack>
            <StackedBar
              height={14}
              parts={[
                ...group.members.map((m) => ({ value: p.byMember[m.id] ?? 0, color: m.color })),
                { value: Math.max(0, p.goal.target - p.saved), color: 'transparent' },
              ]}
            />
            <T tone="secondary">
              {formatMoney(p.saved, p.goal.currency)} de {formatMoney(p.goal.target, p.goal.currency)}
              {p.goal.deadline ? ` · para el ${shortDate(p.goal.deadline)}` : ''}
            </T>
            {p.ratio >= 1 ? (
              <T tone="positive" bold>
                🎉 ¡Lo lograron!
              </T>
            ) : (
              p.monthlyNeeded !== undefined && (
                <T variant="label" tone="secondary">
                  Ritmo necesario: {formatMoney(p.monthlyNeeded, p.goal.currency)} por mes
                </T>
              )
            )}
          </VStack>
        </Card>
      ))}
    </Screen>
  );
}
