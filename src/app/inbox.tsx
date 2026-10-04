import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { guessCategory } from '@/domain/categories';
import { shortDate } from '@/domain/dates';
import { formatMoney } from '@/domain/money';
import { markInboxItem, syncMercadoPago, useMercadoPago, type InboxItem } from '@/pro/mercadopago';
import { useGroup, useStore } from '@/store';
import { EmptyState, notify, Pill, success } from '@/ui/bits';
import { Button } from '@/ui/controls';
import { Card, HStack, Screen, VStack } from '@/ui/layout';
import { T } from '@/ui/text';
import { Space } from '@/ui/theme';

/** Pagos que llegaron de Mercado Pago, para cargarlos o descartarlos con un toque. */
export default function Inbox() {
  const { inbox, connected } = useMercadoPago();
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setBusy(true);
    try {
      await syncMercadoPago();
    } catch (e) {
      notify('Mercado Pago', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen safeTop={false}>
      <T tone="secondary">
        Estos pagos llegaron de tu Mercado Pago. Cargá los que son compartidos y descartá el resto: nada se suma solo sin que lo confirmes.
      </T>
      {connected && <Button title="Buscar pagos nuevos" small variant="secondary" loading={busy} onPress={refresh} style={{ alignSelf: 'flex-start' }} />}
      {inbox.length === 0 ? (
        <EmptyState emoji="📭" title="Todo al día" body="Cuando hagas pagos con Mercado Pago, aparecen acá." />
      ) : (
        inbox.map((item) => <InboxCard key={item.id} item={item} />)
      )}
      {!connected && (
        <Button title="Conectar Mercado Pago" variant="secondary" onPress={() => router.push('/settings')} />
      )}
    </Screen>
  );
}

function InboxCard({ item }: { item: InboxItem }) {
  const group = useGroup();
  const addSettlement = useStore((s) => s.addSettlement);
  const others = group.members.filter((m) => m.id !== group.meId);
  const incoming = item.direction === 'in';

  const asExpense = () =>
    router.push({
      pathname: '/expense/new',
      params: {
        amount: String(item.amount),
        currency: item.currency,
        description: item.description,
        category: guessCategory(item.description) ?? undefined,
        date: item.date,
        paidBy: group.meId,
        inboxId: item.id,
      },
    });

  const asSettlement = (fromId: string) => {
    addSettlement({ from: fromId, to: group.meId, amount: item.amount, date: item.date, note: 'Por Mercado Pago' });
    markInboxItem(item.id, 'added').catch(() => {});
    success();
  };

  return (
    <Card>
      <VStack gap={Space.sm}>
        <HStack style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <T bold numberOfLines={2}>
              {incoming ? '⬇️' : '⬆️'} {item.description}
            </T>
            <T variant="caption" tone="secondary">
              {shortDate(item.date)}
              {item.counterpart ? ` · de ${item.counterpart}` : ''}
            </T>
          </View>
          <T variant="heading" tone={incoming ? 'positive' : 'default'}>
            {incoming ? '+' : ''}
            {formatMoney(item.amount, item.currency)}
          </T>
        </HStack>
        <HStack wrap>
          {incoming ? (
            others.map((m) => <Button key={m.id} title={`Es ${m.name} saldando`} icon="🤝" small onPress={() => asSettlement(m.id)} />)
          ) : (
            <Button title="Cargar como gasto" icon="＋" small onPress={asExpense} />
          )}
          <Button title="No es compartido" small variant="ghost" onPress={() => markInboxItem(item.id, 'dismissed').catch(() => {})} />
          {incoming && <Pill tone="neutral" label="Cobro" />}
        </HStack>
      </VStack>
    </Card>
  );
}
