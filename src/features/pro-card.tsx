import { router } from 'expo-router';
import { View } from 'react-native';

import { PRO } from '@/domain/plan';
import type { Group } from '@/domain/types';
import { usePlan } from '@/pro/client';
import { syncEnabled } from '@/sync/runtime';
import { Button } from '@/ui/controls';
import { Card, HStack } from '@/ui/layout';
import { T } from '@/ui/text';

/** Estado del plan y acceso a la pantalla de Pro. */
export function ProCard({ group }: { group: Group }) {
  const plan = usePlan(group);
  if (!syncEnabled) return null;
  const text =
    plan.tier === 'pro'
      ? plan.shared
        ? 'Tenés Pro gracias a tu grupo 💜'
        : `Pro activo · quedan ${plan.daysLeft} días`
      : plan.tier === 'trial'
        ? `Prueba gratis · quedan ${plan.daysLeft} días`
        : `Mercado Pago, voz sin límite, insights y Excel. Probalo ${PRO.trialDays} días gratis.`;
  return (
    <Card tone="primarySoft" onPress={() => router.push('/pro')}>
      <HStack>
        <View style={{ flex: 1 }}>
          <T bold>⭐ Parejo Pro</T>
          <T variant="label" tone="secondary">
            {text}
          </T>
        </View>
        <Button title={plan.tier === 'free' ? 'Ver' : 'Detalle'} small variant="secondary" onPress={() => router.push('/pro')} />
      </HStack>
    </Card>
  );
}
