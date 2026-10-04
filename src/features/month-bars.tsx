import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { monthLabel } from '@/domain/dates';
import { formatCompact, formatMoney } from '@/domain/money';
import type { Currency } from '@/domain/types';
import { T } from '@/ui/text';
import { Radius, Space, useTheme } from '@/ui/theme';

/**
 * Barras verticales de una sola serie (gasto por mes). Una sola tinta: el mes elegido va lleno,
 * el resto más suave. Etiqueta directa solo en el elegido; tocar una barra la elige.
 */
export function MonthBars({
  data,
  currency,
  height = 150,
  onSelect,
}: {
  data: { month: string; amount: number }[];
  currency: Currency;
  height?: number;
  onSelect?: (month: string) => void;
}) {
  const theme = useTheme();
  const [selected, setSelected] = useState(data[data.length - 1]?.month);
  const max = Math.max(1, ...data.map((d) => d.amount));
  const current = data.find((d) => d.month === selected) ?? data[data.length - 1];

  return (
    <View accessibilityRole="summary" accessibilityLabel={`Gasto por mes: ${data.map((d) => `${monthLabel(d.month, false)} ${formatMoney(d.amount, currency)}`).join(', ')}`}>
      {current && (
        <View style={styles.readout}>
          <T variant="label" tone="secondary" style={styles.capitalize}>
            {monthLabel(current.month)}
          </T>
          <T variant="title">{formatMoney(current.amount, currency)}</T>
        </View>
      )}
      <View style={[styles.plot, { height, borderBottomColor: theme.border }]}>
        {data.map((d) => {
          const active = d.month === current?.month;
          return (
            <Pressable
              key={d.month}
              accessibilityRole="button"
              accessibilityLabel={`${monthLabel(d.month)}: ${formatMoney(d.amount, currency)}`}
              accessibilityState={{ selected: active }}
              onPress={() => {
                setSelected(d.month);
                onSelect?.(d.month);
              }}
              style={styles.slot}>
              {active && (
                <T variant="caption" tone="secondary" style={styles.valueLabel}>
                  {formatCompact(d.amount, currency)}
                </T>
              )}
              <View
                style={[
                  styles.bar,
                  {
                    height: d.amount > 0 ? Math.max(4, (d.amount / max) * (height - 22)) : 0,
                    backgroundColor: theme.primary,
                    opacity: active ? 1 : 0.45,
                  },
                ]}
              />
            </Pressable>
          );
        })}
      </View>
      <View style={styles.axis}>
        {data.map((d) => (
          <T key={d.month} variant="caption" tone={d.month === current?.month ? 'default' : 'secondary'} style={styles.tick}>
            {monthLabel(d.month, false).slice(0, 3)}
          </T>
        ))}
      </View>
    </View>
  );
}

/** Barras horizontales finas para listas (cuotas por mes, etiquetas). */
export function HBar({ ratio }: { ratio: number }) {
  const theme = useTheme();
  return (
    <View style={[styles.hTrack, { backgroundColor: theme.cardAlt }]}>
      <View style={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%`, height: '100%', borderRadius: Radius.sm, backgroundColor: theme.primary }} />
    </View>
  );
}

const styles = StyleSheet.create({
  readout: { marginBottom: Space.md },
  capitalize: { textTransform: 'capitalize' },
  plot: { flexDirection: 'row', alignItems: 'flex-end', gap: Space.sm, borderBottomWidth: 1 },
  slot: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  bar: { width: '100%', maxWidth: 40, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  valueLabel: { marginBottom: 4 },
  axis: { flexDirection: 'row', gap: Space.sm, marginTop: Space.xs },
  tick: { flex: 1, textAlign: 'center', textTransform: 'capitalize' },
  hTrack: { height: 8, borderRadius: Radius.sm, overflow: 'hidden' },
});
