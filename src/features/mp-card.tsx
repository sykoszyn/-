import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { isPro } from '@/domain/plan';
import type { Group } from '@/domain/types';
import { usePlan } from '@/pro/client';
import { goPro } from '@/pro/gate';
import { connectMercadoPago, disconnectMercadoPago, refreshMercadoPago, syncMercadoPago, useMercadoPago } from '@/pro/mercadopago';
import { syncEnabled, useSync } from '@/sync/runtime';
import { confirm, notify, Pill } from '@/ui/bits';
import { Button } from '@/ui/controls';
import { Card, HStack, VStack } from '@/ui/layout';
import { T } from '@/ui/text';
import { Space } from '@/ui/theme';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Conectar Mercado Pago para que los pagos entren solos a la bandeja. */
export function MercadoPagoCard({ group }: { group: Group }) {
  const plan = usePlan(group);
  const userId = useSync((s) => s.userId);
  const { connected, lastSyncedAt, inbox } = useMercadoPago();
  const { mp } = useLocalSearchParams<{ mp?: string }>();
  const [busy, setBusy] = useState<'connect' | 'sync' | null>(null);

  // Volviendo de autorizar en Mercado Pago.
  useEffect(() => {
    if (!mp) return;
    refreshMercadoPago().catch(() => {});
    if (mp === 'error') notify('No se pudo conectar Mercado Pago', 'Probá de nuevo. Si sigue fallando, escribinos.');
  }, [mp]);

  if (!syncEnabled || !userId) return null;

  const run = async (kind: 'connect' | 'sync') => {
    setBusy(kind);
    try {
      if (kind === 'connect') await connectMercadoPago();
      else {
        const added = await syncMercadoPago();
        notify(added ? `Llegaron ${added} pagos nuevos 📥` : 'No hay pagos nuevos');
      }
    } catch (e) {
      notify('Mercado Pago', errorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <VStack gap={Space.md}>
        <HStack style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <T bold>💸 Mercado Pago</T>
            <T variant="label" tone="secondary">
              {connected
                ? `Tus pagos entran solos a la bandeja${lastSyncedAt ? ` · última vez ${new Date(lastSyncedAt).toLocaleDateString('es-AR')}` : ''}.`
                : 'Conectá tu cuenta y tus pagos entran solos: los revisás y se cargan en un toque.'}
            </T>
          </View>
          {connected ? <Pill tone="positive" label="Conectado" /> : !isPro(plan) && <Pill tone="primary" label="Pro" />}
        </HStack>
        {!isPro(plan) ? (
          <Button title="Ver Parejo Pro" small variant="secondary" onPress={() => goPro('mercadopago')} />
        ) : connected ? (
          <HStack wrap>
            <Button title="Traer pagos ahora" small loading={busy === 'sync'} onPress={() => run('sync')} />
            {inbox.length > 0 && <Pill tone="primary" label={`${inbox.length} para revisar`} />}
            <Button
              title="Desconectar"
              small
              variant="ghost"
              onPress={async () => {
                if (await confirm('¿Desconectar Mercado Pago?', 'Dejan de entrar pagos nuevos. Lo que ya cargaste queda.', 'Desconectar')) {
                  disconnectMercadoPago().catch((e) => notify('Mercado Pago', errorText(e)));
                }
              }}
            />
          </HStack>
        ) : (
          <Button title="Conectar Mercado Pago" small loading={busy === 'connect'} onPress={() => run('connect')} />
        )}
      </VStack>
    </Card>
  );
}
