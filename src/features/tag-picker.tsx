import { useState } from 'react';
import { View } from 'react-native';

import { groupTags, normalizeTag } from '@/domain/budgets';
import { FREE_LIMITS, withinLimit } from '@/domain/plan';
import type { Group } from '@/domain/types';
import { usePlan } from '@/plus/client';
import { goPlus } from '@/plus/gate';
import { Button, Chip, Field, Label } from '@/ui/controls';
import { HStack, VStack } from '@/ui/layout';
import { T } from '@/ui/text';
import { Space } from '@/ui/theme';

/** Elegir etiquetas existentes o crear nuevas (el plan gratis tiene tope de etiquetas distintas). */
export function TagPicker({ group, value, onChange }: { group: Group; value: string[]; onChange: (tags: string[]) => void }) {
  const plan = usePlan(group);
  const [draft, setDraft] = useState('');
  const known = groupTags(group);
  const all = [...new Set([...known, ...value])];
  const toggle = (t: string) => onChange(value.includes(t) ? value.filter((x) => x !== t) : [...value, t]);

  const add = () => {
    const tag = normalizeTag(draft);
    if (!tag) return;
    if (!all.includes(tag) && !withinLimit(plan, 'tags', all.length)) {
      goPlus('tags');
      return;
    }
    if (!value.includes(tag)) onChange([...value, tag]);
    setDraft('');
  };

  return (
    <VStack gap={Space.sm}>
      <Label hint="Para agrupar gastos de un viaje, un evento o lo que quieran.">🏷️ Etiquetas (opcional)</Label>
      {all.length > 0 && (
        <HStack wrap>
          {all.map((t) => (
            <Chip key={t} label={`#${t}`} selected={value.includes(t)} onPress={() => toggle(t)} />
          ))}
        </HStack>
      )}
      <HStack>
        <View style={{ flex: 1 }}>
          <Field placeholder="Nueva etiqueta, ej: brasil 2027" value={draft} onChangeText={setDraft} onSubmitEditing={add} autoCapitalize="none" />
        </View>
        <Button title="Agregar" small variant="secondary" disabled={!normalizeTag(draft)} onPress={add} />
      </HStack>
      {plan.tier === 'free' && all.length >= FREE_LIMITS.tags && (
        <T variant="caption" tone="secondary">
          Usaron las {FREE_LIMITS.tags} etiquetas del plan gratis. Con Plus, todas las que quieran.
        </T>
      )}
    </VStack>
  );
}
