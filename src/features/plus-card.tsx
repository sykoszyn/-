import { router } from 'expo-router';
import { View } from 'react-native';

import { PLUS, usd } from '@/domain/plan';
import type { Group } from '@/domain/types';
import { usePlan } from '@/plus/client';
import { syncEnabled } from '@/sync/runtime';
import { Button } from '@/ui/controls';
import { Card, HStack } from '@/ui/layout';
import { T } from '@/ui/text';

/** Estado del plan y acceso a la pantalla de Plus. */
export function PlusCard({ group }: { group: Group }) {
  const plan = usePlan(group);
  if (!syncEnabled) return null;
  const text =
    plan.tier === 'plus'
      ? plan.shared
        ? 'Lo tienen gracias a tu grupo 💞'
        : `Activo · quedan ${plan.daysLeft} días`
      : plan.tier === 'trial'
        ? `Mes gratis · quedan ${plan.daysLeft} días`
        : `Desde USD ${usd(PLUS.prices.month)} por mes para todo el grupo. El primer mes es gratis.`;
  return (
    <Card tone="primarySoft" onPress={() => router.push('/plus')}>
      <HStack>
        <View style={{ flex: 1 }}>
          <T bold>💞 {PLUS.name}</T>
          <T variant="label" tone="secondary">
            {text}
          </T>
        </View>
        <Button title={plan.tier === 'free' ? 'Ver' : 'Detalle'} small variant="secondary" onPress={() => router.push('/plus')} />
      </HStack>
    </Card>
  );
}
