import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { getCategory } from '@/domain/categories';
import { currentMonth, shortDate, today } from '@/domain/dates';
import { describeSplit, memberById } from '@/domain/ledger';
import { formatMoney } from '@/domain/money';
import { FREE_LIMITS, withinLimit } from '@/domain/plan';
import { parseQuickExpense } from '@/domain/quick-add';
import { useSpeech } from '@/features/speech';
import { usePlan } from '@/pro/client';
import { goPro } from '@/pro/gate';
import { useGroup, useStore } from '@/store';
import { Pill, success } from '@/ui/bits';
import { Button } from '@/ui/controls';
import { Card, HStack, Screen, VStack } from '@/ui/layout';
import { T } from '@/ui/text';
import { Fonts, Radius, Space, useTheme } from '@/ui/theme';

const EXAMPLES = ['15 lucas en el súper', 'pagó Sofi 30 mil de la cena', 'heladera 600 mil en 6 cuotas', 'ayer 100 dólares el airbnb'];

export default function QuickAdd() {
  const group = useGroup();
  const theme = useTheme();
  const plan = usePlan(group);
  const saveExpense = useStore((s) => s.saveExpense);
  const usage = useStore((s) => s.usage);
  const countVoice = useStore((s) => s.countVoice);
  const [text, setText] = useState('');
  const month = currentMonth();
  const voiceUsed = usage.month === month ? usage.voice : 0;
  const voice = useSpeech((t, final) => {
    setText(t);
    if (final) countVoice(month);
  });

  const parsed = useMemo(() => (text.trim() ? parseQuickExpense(text, group.members, group.meId, today()) : null), [text, group]);
  const ready = parsed && parsed.amount && parsed.amount > 0;
  const rate = parsed?.currency !== group.currency ? group.usdRate : 1;

  const listen = () => {
    if (voice.listening) return voice.stop();
    if (!withinLimit(plan, 'voicePerMonth', voiceUsed)) return goPro('voice');
    setText('');
    voice.start();
  };

  const save = () => {
    if (!parsed || !ready) return;
    const id = saveExpense({
      description: parsed.description || getCategory(parsed.category).label,
      amount: parsed.amount!,
      currency: parsed.currency,
      rate,
      paidBy: parsed.paidBy,
      split: parsed.split,
      category: parsed.category,
      date: parsed.date,
      installments: parsed.installments,
    });
    success();
    router.replace({ pathname: '/expense/[id]', params: { id, created: '1' } });
  };

  const edit = () => {
    if (!parsed) return;
    router.replace({
      pathname: '/expense/new',
      params: {
        amount: parsed.amount ? String(parsed.amount) : undefined,
        currency: parsed.currency,
        description: parsed.description,
        category: parsed.category,
        date: parsed.date,
        paidBy: parsed.paidBy,
        installments: String(parsed.installments),
        fullFor: parsed.split.mode === 'full' ? parsed.split.memberId : undefined,
      },
    });
  };

  const payer = parsed ? memberById(group, parsed.paidBy) : undefined;

  return (
    <Screen
      safeTop={false}
      footer={
        <HStack>
          <Button title="Revisar" variant="secondary" disabled={!parsed} onPress={edit} style={styles.flex} />
          <Button title="Guardar" disabled={!ready} onPress={save} style={styles.flex} />
        </HStack>
      }>
      <T tone="secondary" center>
        Decí o escribí el gasto como te salga. Parejo entiende el resto.
      </T>

      {voice.supported && (
        <View style={styles.micWrap}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={voice.listening ? 'Dejar de escuchar' : 'Hablar'}
            onPress={listen}
            style={({ pressed }) => [
              styles.mic,
              { backgroundColor: voice.listening ? theme.negative : theme.primary, opacity: pressed ? 0.8 : 1 },
            ]}>
            <T style={styles.micIcon}>{voice.listening ? '⏹️' : '🎙️'}</T>
          </Pressable>
          <T variant="label" tone="secondary">
            {voice.listening ? 'Te escucho…' : 'Tocá y hablá'}
          </T>
          {plan.tier === 'free' && (
            <T variant="caption" tone="secondary">
              {Math.max(0, FREE_LIMITS.voicePerMonth - voiceUsed)} de {FREE_LIMITS.voicePerMonth} cargas por voz este mes · sin límite con Pro
            </T>
          )}
          {voice.error && (
            <T variant="caption" tone="negative">
              {voice.error}
            </T>
          )}
        </View>
      )}

      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={voice.supported ? 'O escribilo acá…' : 'Escribilo o usá el micrófono del teclado 🎙️'}
        placeholderTextColor={theme.textSecondary}
        multiline
        autoFocus={!voice.supported}
        accessibilityLabel="Gasto en palabras"
        style={[styles.input, { color: theme.text, backgroundColor: theme.card, borderColor: theme.border }]}
      />

      {!text && (
        <VStack gap={Space.xs}>
          <T variant="caption" tone="secondary">
            Por ejemplo:
          </T>
          <HStack wrap>
            {EXAMPLES.map((e) => (
              <Pressable key={e} onPress={() => setText(e)}>
                <Pill tone="neutral" label={`“${e}”`} />
              </Pressable>
            ))}
          </HStack>
        </VStack>
      )}

      {parsed && (
        <Card>
          <VStack gap={Space.sm}>
            <HStack style={styles.between}>
              <T variant="heading">
                {getCategory(parsed.category).emoji} {parsed.description || getCategory(parsed.category).label}
              </T>
              <T variant="heading" tone={ready ? 'default' : 'warning'}>
                {parsed.amount ? formatMoney(parsed.amount, parsed.currency) : '¿Cuánto?'}
              </T>
            </HStack>
            <HStack wrap>
              <Pill tone="primary" label={`Pagó ${parsed.paidBy === group.meId ? 'vos' : (payer?.name ?? '?')}`} />
              <Pill tone="neutral" label={describeSplit(parsed.split, group)} />
              {parsed.installments > 1 && <Pill tone="warning" label={`${parsed.installments} cuotas`} />}
              <Pill tone="neutral" label={parsed.date === today() ? 'Hoy' : shortDate(parsed.date)} />
              {parsed.currency !== group.currency && parsed.amount && (
                <Pill tone="neutral" label={`≈ ${formatMoney(Math.round(parsed.amount * rate), group.currency)}`} />
              )}
            </HStack>
            {!ready && (
              <T variant="caption" tone="warning">
                Falta el monto. Decí algo como “15 mil” o “15 lucas”.
              </T>
            )}
          </VStack>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  between: { justifyContent: 'space-between' },
  micWrap: { alignItems: 'center', gap: Space.sm, paddingVertical: Space.md },
  mic: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  micIcon: { fontSize: 40, lineHeight: 48 },
  input: {
    minHeight: 90,
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Space.lg,
    fontFamily: Fonts.sans,
    fontSize: 18,
    textAlignVertical: 'top',
  },
});
