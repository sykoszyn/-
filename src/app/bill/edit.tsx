import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { CATEGORIES } from '@/domain/categories';
import { centsToInput, parseAmount } from '@/domain/money';
import type { Split } from '@/domain/types';
import { SplitPicker } from '@/features/split-picker';
import { useGroup, useStore } from '@/store';
import { confirm } from '@/ui/bits';
import { Button, Chip, ChipGroup, Field, Label } from '@/ui/controls';
import { HStack, Screen, VStack } from '@/ui/layout';
import { Space } from '@/ui/theme';

const PRESETS = [
  { name: 'Alquiler', emoji: '🏠', category: 'home', dueDay: 10 },
  { name: 'Expensas', emoji: '🏢', category: 'home', dueDay: 10 },
  { name: 'Luz', emoji: '💡', category: 'services', dueDay: 15 },
  { name: 'Gas', emoji: '🔥', category: 'services', dueDay: 15 },
  { name: 'Agua', emoji: '🚰', category: 'services', dueDay: 15 },
  { name: 'Internet', emoji: '📶', category: 'services', dueDay: 20 },
  { name: 'Celulares', emoji: '📱', category: 'services', dueDay: 20 },
  { name: 'Streaming', emoji: '📺', category: 'subscriptions', dueDay: 25 },
  { name: 'Prepaga', emoji: '🩺', category: 'health', dueDay: 10 },
  { name: 'Gimnasio', emoji: '🏋️', category: 'health', dueDay: 5 },
];

export default function BillForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const group = useGroup();
  const saveBill = useStore((s) => s.saveBill);
  const deleteBill = useStore((s) => s.deleteBill);
  const existing = id ? group.bills.find((b) => b.id === id) : undefined;

  const [name, setName] = useState(existing?.name ?? '');
  const [emoji, setEmoji] = useState(existing?.emoji ?? '🧾');
  const [amountText, setAmountText] = useState(existing?.amount ? centsToInput(existing.amount) : '');
  const [dueDayText, setDueDayText] = useState(String(existing?.dueDay ?? 10));
  const [category, setCategory] = useState(existing?.category ?? 'services');
  const [payerId, setPayerId] = useState(existing?.payerId ?? group.meId);
  const [split, setSplit] = useState<Split>(existing?.split ?? { mode: 'equal' });
  const [active, setActive] = useState(existing?.active ?? true);

  const dueDay = Math.min(31, Math.max(1, Number(dueDayText) || 1));
  const valid = name.trim().length > 0;

  const save = () => {
    saveBill({
      id: existing?.id,
      name: name.trim(),
      emoji,
      amount: parseAmount(amountText) ?? 0,
      dueDay,
      category,
      split,
      payerId,
      active,
    });
    router.back();
  };

  return (
    <Screen safeTop={false} footer={<Button title={existing ? 'Guardar' : 'Agregar fijo'} disabled={!valid} onPress={save} />}>
      {!existing && (
        <VStack gap={Space.sm}>
          <Label>Rápido</Label>
          <HStack wrap>
            {PRESETS.map((p) => (
              <Chip
                key={p.name}
                label={p.name}
                icon={p.emoji}
                selected={name === p.name}
                onPress={() => {
                  setName(p.name);
                  setEmoji(p.emoji);
                  setCategory(p.category);
                  setDueDayText(String(p.dueDay));
                }}
              />
            ))}
          </HStack>
        </VStack>
      )}
      <Field label="Nombre" placeholder="Ej: Alquiler" value={name} onChangeText={setName} />
      <Field label="Monto aproximado" hint="Opcional. Si varía (como la luz), dejalo vacío." keyboardType="decimal-pad" inputMode="decimal" placeholder="0" value={amountText} onChangeText={setAmountText} />
      <Field label="Día de vencimiento" keyboardType="number-pad" inputMode="numeric" value={dueDayText} onChangeText={setDueDayText} />
      <VStack gap={Space.sm}>
        <Label>Categoría</Label>
        <ChipGroup options={CATEGORIES.map((c) => ({ value: c.id, label: c.label, icon: c.emoji }))} value={category} onChange={setCategory} />
      </VStack>
      <VStack gap={Space.sm}>
        <Label>¿Quién lo suele pagar?</Label>
        <HStack wrap>
          {group.members.map((m) => (
            <Chip key={m.id} label={m.name} icon={m.emoji} selected={payerId === m.id} onPress={() => setPayerId(m.id)} />
          ))}
        </HStack>
      </VStack>
      <SplitPicker members={group.members} value={split} onChange={setSplit} />
      {existing && (
        <VStack>
          <Button title={active ? 'Pausar este fijo' : 'Reactivar'} variant="secondary" onPress={() => setActive(!active)} />
          <Button
            title="Borrar fijo"
            variant="danger"
            onPress={async () => {
              if (await confirm('¿Borrar este fijo?', 'Los pagos que ya cargaste se mantienen en las cuentas.')) {
                deleteBill(existing.id);
                router.back();
              }
            }}
          />
        </VStack>
      )}
    </Screen>
  );
}
