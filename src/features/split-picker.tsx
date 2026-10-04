import { StyleSheet, TextInput, View } from 'react-native';

import type { Member, Split } from '@/domain/types';
import { Avatar } from '@/ui/bits';
import { Chip, Label } from '@/ui/controls';
import { T } from '@/ui/text';
import { Fonts, Radius, Space, useTheme } from '@/ui/theme';

type Props = { members: Member[]; value: Split; onChange: (split: Split) => void };

/** Elegir cómo se divide un gasto: iguales, por ingresos, todo de alguien o personalizado. */
export function SplitPicker({ members, value, onChange }: Props) {
  const theme = useTheme();
  const couple = members.length === 2;
  const incomesReady = members.every((m) => (m.income ?? 0) > 0);
  const equalIds = value.mode === 'equal' ? (value.memberIds ?? members.map((m) => m.id)) : [];

  const toggleParticipant = (id: string) => {
    const next = equalIds.includes(id) ? equalIds.filter((x) => x !== id) : [...equalIds, id];
    if (next.length === 0) return;
    onChange({ mode: 'equal', memberIds: next.length === members.length ? undefined : next });
  };

  const customWeights = value.mode === 'custom' ? value.weights : Object.fromEntries(members.map((m) => [m.id, Math.round(100 / members.length)]));
  const customTotal = Object.values(customWeights).reduce((a, b) => a + (b || 0), 0);

  return (
    <View style={styles.wrap}>
      <Label>¿Cómo lo dividen?</Label>
      <View style={styles.chips}>
        <Chip label={couple ? 'Mitad y mitad' : 'Partes iguales'} icon="⚖️" selected={value.mode === 'equal'} onPress={() => onChange({ mode: 'equal' })} />
        <Chip label="Según ingresos" icon="📐" selected={value.mode === 'income'} onPress={() => onChange({ mode: 'income' })} />
        {members.map((m) => (
          <Chip
            key={m.id}
            label={`Todo de ${m.name}`}
            icon={m.emoji}
            selected={value.mode === 'full' && value.memberId === m.id}
            onPress={() => onChange({ mode: 'full', memberId: m.id })}
          />
        ))}
        <Chip label="Personalizado" icon="🎚️" selected={value.mode === 'custom'} onPress={() => onChange({ mode: 'custom', weights: customWeights })} />
      </View>

      {value.mode === 'income' && !incomesReady && (
        <T variant="caption" tone="warning">
          Para dividir según ingresos, cargá cuánto gana cada uno en Ajustes. Mientras tanto, se divide en partes iguales.
        </T>
      )}
      {value.mode === 'income' && incomesReady && (
        <T variant="caption" tone="secondary">
          {members
            .map((m) => `${m.name} ${Math.round(((m.income ?? 0) / members.reduce((a, x) => a + (x.income ?? 0), 0)) * 100)}%`)
            .join(' · ')}
          {'  '}— cada uno pone en proporción a lo que gana.
        </T>
      )}

      {value.mode === 'equal' && members.length > 2 && (
        <View style={styles.chips}>
          {members.map((m) => (
            <Chip key={m.id} label={m.name} icon={equalIds.includes(m.id) ? '✓' : undefined} selected={equalIds.includes(m.id)} onPress={() => toggleParticipant(m.id)} />
          ))}
        </View>
      )}

      {value.mode === 'custom' && (
        <View style={styles.custom}>
          {members.map((m) => (
            <View key={m.id} style={styles.customRow}>
              <Avatar member={m} size={30} />
              <T style={styles.flex}>{m.name}</T>
              <TextInput
                value={String(customWeights[m.id] ?? 0)}
                onChangeText={(text) => {
                  const n = Number(text.replace(/[^\d]/g, '')) || 0;
                  onChange({ mode: 'custom', weights: { ...customWeights, [m.id]: n } });
                }}
                keyboardType="number-pad"
                inputMode="numeric"
                accessibilityLabel={`Porcentaje de ${m.name}`}
                style={[styles.percent, { color: theme.text, borderColor: theme.border, backgroundColor: theme.card }]}
              />
              <T tone="secondary">%</T>
            </View>
          ))}
          {customTotal !== 100 && (
            <T variant="caption" tone="warning">
              Suman {customTotal}%. Lo repartimos proporcionalmente igual, pero ojo.
            </T>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  flex: { flex: 1 },
  custom: { gap: Space.sm },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  percent: {
    width: 72,
    textAlign: 'right',
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    fontFamily: Fonts.sans,
    fontSize: 16,
  },
});
