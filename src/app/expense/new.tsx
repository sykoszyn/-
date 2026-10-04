import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CATEGORIES, guessCategory } from '@/domain/categories';
import { addMonths, monthLabel, monthOf, today, yesterday } from '@/domain/dates';
import { memberById, splitAmount } from '@/domain/ledger';
import { centsToInput, formatMoney, parseAmount } from '@/domain/money';
import type { Currency, Split } from '@/domain/types';
import { SplitPicker } from '@/features/split-picker';
import { TagPicker } from '@/features/tag-picker';
import { markInboxItem } from '@/pro/mercadopago';
import { useGroup, useStore } from '@/store';
import { Avatar, success } from '@/ui/bits';
import { AmountInput, Button, Chip, ChipGroup, Field, Label } from '@/ui/controls';
import { Card, HStack, Screen, VStack } from '@/ui/layout';
import { T } from '@/ui/text';
import { Space } from '@/ui/theme';

const INSTALLMENTS = [1, 3, 6, 9, 12, 18, 24];

export default function ExpenseForm() {
  const params = useLocalSearchParams<{
    id?: string;
    billId?: string;
    // Precarga desde la carga por voz o la bandeja de Mercado Pago.
    amount?: string;
    currency?: Currency;
    description?: string;
    category?: string;
    date?: string;
    paidBy?: string;
    installments?: string;
    fullFor?: string;
    tags?: string;
    inboxId?: string;
  }>();
  const group = useGroup();
  const saveExpense = useStore((s) => s.saveExpense);
  const existing = params.id ? group.expenses.find((e) => e.id === params.id) : undefined;
  const bill = params.billId ? group.bills.find((b) => b.id === params.billId) : undefined;

  const [amountText, setAmountText] = useState(
    existing
      ? centsToInput(existing.amount)
      : params.amount
        ? centsToInput(Number(params.amount))
        : bill?.amount
          ? centsToInput(bill.amount)
          : '',
  );
  const [currency, setCurrency] = useState<Currency>(existing?.currency ?? params.currency ?? group.currency);
  const [rateText, setRateText] = useState(String(existing && existing.currency !== group.currency ? existing.rate : group.usdRate));
  const [description, setDescription] = useState(existing?.description ?? params.description ?? bill?.name ?? '');
  const [category, setCategory] = useState(existing?.category ?? params.category ?? bill?.category ?? guessCategory(params.description ?? '') ?? '');
  const [categoryTouched, setCategoryTouched] = useState(Boolean(existing || bill || params.category));
  const [paidBy, setPaidBy] = useState(
    existing?.paidBy ?? (params.paidBy && memberById(group, params.paidBy) ? params.paidBy : undefined) ?? bill?.payerId ?? group.meId,
  );
  const [split, setSplit] = useState<Split>(
    existing?.split ?? (params.fullFor && memberById(group, params.fullFor) ? { mode: 'full', memberId: params.fullFor } : undefined) ?? bill?.split ?? { mode: 'equal' },
  );
  const [installments, setInstallments] = useState(existing?.installments ?? (Number(params.installments) || 1));
  const [date, setDate] = useState(existing?.date ?? params.date ?? today());
  const [tags, setTags] = useState<string[]>(existing?.tags ?? (params.tags ? params.tags.split(',').filter(Boolean) : []));

  const amount = parseAmount(amountText) ?? 0;
  const rate = currency === group.currency ? 1 : Number(rateText.replace(',', '.')) || 0;
  const baseAmount = Math.round(amount * rate);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date));
  const valid = amount > 0 && rate > 0 && description.trim().length > 0 && validDate;

  const preview = useMemo(() => {
    if (baseAmount <= 0) return null;
    const shares = splitAmount(baseAmount, split, group.members);
    return group.members
      .filter((m) => m.id !== paidBy && (shares[m.id] ?? 0) > 0)
      .map((m) => ({ member: m, amount: shares[m.id] }));
  }, [baseAmount, split, group.members, paidBy]);

  const onDescription = (text: string) => {
    setDescription(text);
    if (!categoryTouched) setCategory(guessCategory(text) ?? '');
  };

  const save = () => {
    if (!valid) return;
    const id = saveExpense({
      id: existing?.id,
      description: description.trim(),
      amount,
      currency,
      rate,
      paidBy,
      split,
      category: category || 'other',
      date,
      installments,
      billId: existing?.billId ?? bill?.id,
      tags: tags.length ? tags : undefined,
    });
    if (params.inboxId) markInboxItem(params.inboxId, 'added').catch(() => {});
    success();
    if (existing) router.back();
    else router.replace({ pathname: '/expense/[id]', params: { id, created: '1' } });
  };

  const payerName = memberById(group, paidBy)?.name ?? '';

  return (
    <Screen
      safeTop={false}
      footer={<Button title={existing ? 'Guardar cambios' : 'Guardar gasto'} disabled={!valid} onPress={save} />}>
      {bill && !existing && (
        <Card tone="primarySoft">
          <T variant="label">
            {bill.emoji} Registrando el pago de <T variant="label" bold>{bill.name}</T> de {monthLabel(monthOf(date), false)}.
          </T>
        </Card>
      )}

      <VStack gap={Space.sm}>
        <AmountInput value={amountText} onChangeText={setAmountText} symbol={currency === 'USD' ? 'US$' : '$'} autoFocus={!existing && !bill} />
        <HStack>
          <Chip label="Pesos" selected={currency === 'ARS'} onPress={() => setCurrency('ARS')} />
          <Chip label="Dólares" selected={currency === 'USD'} onPress={() => setCurrency('USD')} />
          {currency === 'USD' && (
            <T variant="caption" tone="secondary" style={styles.flex}>
              ≈ {formatMoney(baseAmount, group.currency)}
            </T>
          )}
        </HStack>
        {currency === 'USD' && (
          <Field label="Cotización (pesos por dólar)" keyboardType="decimal-pad" inputMode="decimal" value={rateText} onChangeText={setRateText} />
        )}
      </VStack>

      <Field label="¿En qué?" placeholder="Ej: Súper, alquiler, cena..." value={description} onChangeText={onDescription} />

      <VStack gap={Space.sm}>
        <Label>Categoría</Label>
        <ChipGroup
          options={CATEGORIES.map((c) => ({ value: c.id, label: c.label, icon: c.emoji }))}
          value={category}
          onChange={(c) => {
            setCategory(c);
            setCategoryTouched(true);
          }}
        />
      </VStack>

      <VStack gap={Space.sm}>
        <Label>¿Quién pagó?</Label>
        <HStack wrap>
          {group.members.map((m) => (
            <Chip key={m.id} label={m.id === group.meId ? `${m.name} (vos)` : m.name} icon={m.emoji} selected={paidBy === m.id} onPress={() => setPaidBy(m.id)} />
          ))}
        </HStack>
      </VStack>

      <SplitPicker members={group.members} value={split} onChange={setSplit} />

      <VStack gap={Space.sm}>
        <Label hint="Si lo pagaron con tarjeta en cuotas, se carga una cuota por mes.">💳 ¿En cuotas?</Label>
        <ChipGroup options={[...new Set([...INSTALLMENTS, installments])].sort((a, b) => a - b).map((n) => ({ value: n, label: n === 1 ? 'Un pago' : `${n} cuotas` }))} value={installments} onChange={setInstallments} />
        {installments > 1 && amount > 0 && (
          <T variant="caption" tone="secondary">
            {installments} cuotas de {formatMoney(Math.round(baseAmount / installments), group.currency)} · la última en {monthLabel(addMonths(monthOf(validDate ? date : today()), installments - 1))}
          </T>
        )}
      </VStack>

      <TagPicker group={group} value={tags} onChange={setTags} />

      <VStack gap={Space.sm}>
        <Label>Fecha</Label>
        <HStack wrap>
          <Chip label="Hoy" selected={date === today()} onPress={() => setDate(today())} />
          <Chip label="Ayer" selected={date === yesterday()} onPress={() => setDate(yesterday())} />
          <Field value={date} onChangeText={setDate} placeholder="AAAA-MM-DD" style={styles.dateInput} accessibilityLabel="Fecha" />
        </HStack>
        {!validDate && (
          <T variant="caption" tone="negative">
            Usá el formato AAAA-MM-DD.
          </T>
        )}
      </VStack>

      {preview && preview.length > 0 && (
        <Card tone="alt">
          <VStack>
            <T variant="label" tone="secondary">
              Así queda {installments > 1 ? '(en total, cuota a cuota)' : ''}
            </T>
            {preview.map(({ member, amount: owed }) => (
              <HStack key={member.id}>
                <Avatar member={member} size={28} />
                <T style={styles.flex}>
                  {paidBy === group.meId
                    ? `${member.name} te debe`
                    : member.id === group.meId
                      ? `Le debés a ${payerName}`
                      : `${member.name} le debe a ${payerName}`}
                </T>
                <T bold>{formatMoney(owed, group.currency)}</T>
              </HStack>
            ))}
          </VStack>
        </Card>
      )}
      <View style={styles.spacer} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  dateInput: { minWidth: 140, minHeight: 40, paddingVertical: Space.sm },
  spacer: { height: Space.xl },
});
