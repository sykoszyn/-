import { Pressable } from 'react-native';

import type { BudgetStatus } from '@/domain/budgets';
import { formatMoney } from '@/domain/money';
import type { Currency } from '@/domain/types';
import { ProgressBar } from '@/ui/bits';
import { HStack, VStack } from '@/ui/layout';
import { T } from '@/ui/text';
import { Space, useTheme } from '@/ui/theme';

/** Barras de presupuesto: gastado contra tope, en color según qué tan cerca están. */
export function BudgetBars({ statuses, currency, onPress }: { statuses: BudgetStatus[]; currency: Currency; onPress?: (s: BudgetStatus) => void }) {
  const theme = useTheme();
  return (
    <VStack gap={Space.md}>
      {statuses.map((s) => {
        const color = s.state === 'over' ? theme.negative : s.state === 'warning' ? theme.warning : theme.positive;
        return (
          <Pressable key={s.budget.id} disabled={!onPress} onPress={() => onPress?.(s)} accessibilityRole={onPress ? 'button' : undefined}>
            <VStack gap={6}>
              <HStack style={{ justifyContent: 'space-between' }}>
                <T bold>
                  {s.emoji} {s.label}
                </T>
                <T variant="label" tone="secondary">
                  {formatMoney(s.spent, currency)} / {formatMoney(s.budget.amount, currency)}
                </T>
              </HStack>
              <ProgressBar ratio={Math.min(1, s.ratio)} color={color} />
              <T variant="caption" tone={s.state === 'over' ? 'negative' : s.state === 'warning' ? 'warning' : 'secondary'}>
                {s.state === 'over'
                  ? `Se pasaron por ${formatMoney(-s.remaining, currency)}`
                  : `Quedan ${formatMoney(s.remaining, currency)} (${Math.round(s.ratio * 100)}% usado)`}
              </T>
            </VStack>
          </Pressable>
        );
      })}
    </VStack>
  );
}
