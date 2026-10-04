import { router } from 'expo-router';

import { getCategory } from '@/domain/categories';
import { shortDate } from '@/domain/dates';
import { describeSplit, expenseBaseAmount, memberById, splitAmount } from '@/domain/ledger';
import { formatMoney } from '@/domain/money';
import type { Expense, Group, Settlement } from '@/domain/types';
import { Row } from '@/ui/layout';
import { useTheme } from '@/ui/theme';

import { impactLabel } from './phrases';

export function ExpenseRow({ expense, group, last }: { expense: Expense; group: Group; last?: boolean }) {
  const category = getCategory(expense.category);
  const payer = memberById(group, expense.paidBy);
  const total = expenseBaseAmount(expense);
  const impact = impactLabel(expense.paidBy, splitAmount(total, expense.split, group.members), total, group.meId, payer?.name ?? '?', group.currency);
  const bits = [
    `${shortDate(expense.date)}`,
    `pagó ${expense.paidBy === group.meId ? 'vos' : (payer?.name ?? '?')}`,
    expense.installments > 1 ? `${expense.installments} cuotas` : describeSplit(expense.split, group),
  ];
  return (
    <Row
      icon={category.emoji}
      iconBg={category.color + '22'}
      title={expense.description}
      subtitle={bits.join(' · ')}
      right={expense.currency === 'USD' ? formatMoney(expense.amount, 'USD') : formatMoney(total, group.currency)}
      rightSub={impact.text}
      rightTone="default"
      onPress={() => router.push({ pathname: '/expense/[id]', params: { id: expense.id } })}
      last={last}
    />
  );
}

export function SettlementRow({ settlement, group, last, onPress }: { settlement: Settlement; group: Group; last?: boolean; onPress?: () => void }) {
  const theme = useTheme();
  const from = memberById(group, settlement.from);
  const to = memberById(group, settlement.to);
  return (
    <Row
      icon="🤝"
      iconBg={theme.positiveSoft}
      title={`${from?.name ?? '?'} le pagó a ${to?.name ?? '?'}`}
      subtitle={`${shortDate(settlement.date)}${settlement.note ? ` · ${settlement.note}` : ''}`}
      right={formatMoney(settlement.amount, group.currency)}
      rightTone="positive"
      onPress={onPress}
      last={last}
    />
  );
}
