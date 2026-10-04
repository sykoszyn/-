import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { currentMonth, today } from '@/domain/dates';
import { balances, memberById, simplifyDebts } from '@/domain/ledger';
import { centsToInput, formatMoney, parseAmount } from '@/domain/money';
import type { Transfer } from '@/domain/types';
import { SettlementRow } from '@/features/expense-row';
import { reminderMessage } from '@/features/phrases';
import { useGroup, useStore } from '@/store';
import { Avatar, confirm, copy, EmptyState, shareText, success } from '@/ui/bits';
import { Button, Field } from '@/ui/controls';
import { Card, HStack, Screen, Section, VStack } from '@/ui/layout';
import { T } from '@/ui/text';
import { Space } from '@/ui/theme';

export default function Settle() {
  const group = useGroup();
  const transfers = simplifyDebts(balances(group, currentMonth()));
  const deleteSettlement = useStore((s) => s.deleteSettlement);
  const history = [...group.settlements].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);

  return (
    <Screen safeTop={false}>
      {transfers.length === 0 ? (
        <EmptyState emoji="✨" title="¡Están parejos!" body="No hay nada que saldar. Disfruten." />
      ) : (
        <>
          <T tone="secondary">
            {transfers.length === 1 ? 'Con una sola transferencia quedan parejos:' : `Con ${transfers.length} transferencias quedan todos parejos:`}
          </T>
          {transfers.map((t) => (
            <TransferCard key={`${t.from}-${t.to}`} transfer={t} />
          ))}
        </>
      )}

      {history.length > 0 && (
        <Section title="Pagos anteriores">
          <Card>
            {history.map((s, i) => (
              <SettlementRow
                key={s.id}
                settlement={s}
                group={group}
                last={i === history.length - 1}
                onPress={async () => {
                  if (await confirm('¿Borrar este pago?', 'Vuelve a contar como deuda pendiente.')) deleteSettlement(s.id);
                }}
              />
            ))}
          </Card>
        </Section>
      )}
    </Screen>
  );
}

function TransferCard({ transfer }: { transfer: Transfer }) {
  const group = useGroup();
  const addSettlement = useStore((s) => s.addSettlement);
  const from = memberById(group, transfer.from)!;
  const to = memberById(group, transfer.to)!;
  const [editing, setEditing] = useState(false);
  const [amountText, setAmountText] = useState(centsToInput(transfer.amount));
  const amount = parseAmount(amountText) ?? 0;
  const iPay = from.id === group.meId;
  const iReceive = to.id === group.meId;

  const register = (cents: number) => {
    addSettlement({ from: from.id, to: to.id, amount: cents, date: today(), note: cents < transfer.amount ? 'Pago parcial' : undefined });
    success();
    setEditing(false);
  };

  return (
    <Card>
      <VStack gap={Space.md}>
        <HStack style={styles.between}>
          <HStack>
            <Avatar member={from} />
            <T variant="heading">→</T>
            <Avatar member={to} />
          </HStack>
          <T variant="title">{formatMoney(transfer.amount, group.currency)}</T>
        </HStack>
        <T>
          {iPay ? 'Vos' : from.name} le {iPay ? 'pasás' : 'pasa'} a {iReceive ? 'vos' : to.name}
        </T>

        {to.alias ? (
          <HStack style={styles.between}>
            <View style={styles.flex}>
              <T variant="caption" tone="secondary">
                Alias de {to.name}
              </T>
              <T bold selectable>
                {to.alias}
              </T>
            </View>
            <Button title="Copiar" small variant="secondary" onPress={() => copy(to.alias!, 'Alias copiado')} />
          </HStack>
        ) : (
          <T variant="caption" tone="secondary">
            Tip: cargá el alias de {to.name} en Ajustes para copiarlo desde acá.
          </T>
        )}

        {editing ? (
          <VStack>
            <Field label="¿Cuánto pagó?" keyboardType="decimal-pad" inputMode="decimal" value={amountText} onChangeText={setAmountText} />
            <HStack>
              <Button title="Registrar" small disabled={amount <= 0} onPress={() => register(amount)} />
              <Button title="Cancelar" small variant="ghost" onPress={() => setEditing(false)} />
            </HStack>
          </VStack>
        ) : (
          <VStack>
            <Button title={iPay ? 'Ya le pagué' : 'Ya me pagó'} icon="✅" onPress={() => register(transfer.amount)} />
            <HStack wrap>
              <Button title="Pagó una parte" small variant="ghost" onPress={() => setEditing(true)} />
              {iReceive && (
                <Button title="Mandar recordatorio" small variant="ghost" onPress={() => shareText(reminderMessage(group, transfer))} />
              )}
            </HStack>
          </VStack>
        )}
      </VStack>
    </Card>
  );
}

const styles = StyleSheet.create({
  between: { justifyContent: 'space-between' },
  flex: { flex: 1 },
});
