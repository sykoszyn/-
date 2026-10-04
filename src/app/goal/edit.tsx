import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { centsToInput, parseAmount } from '@/domain/money';
import type { Currency } from '@/domain/types';
import { useGroup, useStore } from '@/store';
import { confirm } from '@/ui/bits';
import { Button, Chip, Field, Label } from '@/ui/controls';
import { HStack, Screen, VStack } from '@/ui/layout';
import { T } from '@/ui/text';
import { Space } from '@/ui/theme';

const EMOJIS = ['🏖️', '✈️', '🏠', '🚗', '💍', '👶', '🐶', '🛟', '🎓', '🎸', '💻', '🎯'];

export default function GoalForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const group = useGroup();
  const saveGoal = useStore((s) => s.saveGoal);
  const deleteGoal = useStore((s) => s.deleteGoal);
  const existing = id ? group.goals.find((g) => g.id === id) : undefined;

  const [name, setName] = useState(existing?.name ?? '');
  const [emoji, setEmoji] = useState(existing?.emoji ?? '🎯');
  const [targetText, setTargetText] = useState(existing ? centsToInput(existing.target) : '');
  const [currency, setCurrency] = useState<Currency>(existing?.currency ?? 'ARS');
  const [deadline, setDeadline] = useState(existing?.deadline ?? '');

  const target = parseAmount(targetText) ?? 0;
  const deadlineValid = deadline === '' || (/^\d{4}-\d{2}-\d{2}$/.test(deadline) && !Number.isNaN(Date.parse(deadline)));
  const valid = name.trim().length > 0 && target > 0 && deadlineValid;

  const save = () => {
    const goalId = saveGoal({ id: existing?.id, name: name.trim(), emoji, target, currency, deadline: deadline || undefined });
    if (existing) router.back();
    else router.replace({ pathname: '/goal/[id]', params: { id: goalId } });
  };

  return (
    <Screen safeTop={false} footer={<Button title={existing ? 'Guardar' : 'Crear meta'} disabled={!valid} onPress={save} />}>
      <VStack gap={Space.sm}>
        <Label>Ícono</Label>
        <HStack wrap>
          {EMOJIS.map((e) => (
            <Chip key={e} label={e} selected={emoji === e} onPress={() => setEmoji(e)} />
          ))}
        </HStack>
      </VStack>
      <Field label="¿Para qué ahorran?" placeholder="Ej: Viaje a Brasil" value={name} onChangeText={setName} />
      <VStack gap={Space.sm}>
        <Field label="¿Cuánto necesitan?" keyboardType="decimal-pad" inputMode="decimal" placeholder="0" value={targetText} onChangeText={setTargetText} />
        <HStack>
          <Chip label="Pesos" selected={currency === 'ARS'} onPress={() => setCurrency('ARS')} />
          <Chip label="Dólares" selected={currency === 'USD'} onPress={() => setCurrency('USD')} />
        </HStack>
      </VStack>
      <Field label="¿Para cuándo? (opcional)" hint="Con fecha, Parejo calcula cuánto ahorrar por mes." placeholder="AAAA-MM-DD" value={deadline} onChangeText={setDeadline} />
      {!deadlineValid && (
        <T variant="caption" tone="negative">
          Usá el formato AAAA-MM-DD.
        </T>
      )}
      {existing && (
        <Button
          title="Borrar meta"
          variant="danger"
          onPress={async () => {
            if (await confirm('¿Borrar esta meta?', 'Se pierde el historial de aportes.')) {
              deleteGoal(existing.id);
              router.dismissTo('/goals');
            }
          }}
        />
      )}
    </Screen>
  );
}
