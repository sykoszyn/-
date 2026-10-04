import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { shortDate } from '@/domain/dates';
import { FREE_LIMITS, PLUS, PLUS_FEATURES, usd, yearlyDeal, type BillingPeriod, type PlusFeature } from '@/domain/plan';
import { refreshPlan, startTrial, subscribe, usePlan } from '@/plus/client';
import { useMaybeGroup } from '@/store';
import { syncEnabled, useSync } from '@/sync/runtime';
import { notify, Pill, success } from '@/ui/bits';
import { Button } from '@/ui/controls';
import { Card, HStack, Screen, VStack } from '@/ui/layout';
import { T } from '@/ui/text';
import { Radius, Space, useTheme } from '@/ui/theme';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function PlusScreen() {
  const { feature, status } = useLocalSearchParams<{ feature?: PlusFeature; status?: string }>();
  const group = useMaybeGroup();
  const plan = usePlan(group);
  const userId = useSync((s) => s.userId);
  const [period, setPeriod] = useState<BillingPeriod>('year');
  const [busy, setBusy] = useState<'trial' | 'buy' | null>(null);
  const wanted = PLUS_FEATURES.find((f) => f.id === feature);
  const returning = status === 'ok' || status === 'pending';
  const deal = yearlyDeal();
  const active = plan.tier === 'plus';

  // Al volver de Mercado Pago, el pago se confirma por webhook: consultamos un ratito.
  useEffect(() => {
    if (!returning) return;
    const id = setInterval(() => refreshPlan().catch(() => {}), 3000);
    const stop = setTimeout(() => clearInterval(id), 60_000);
    return () => {
      clearInterval(id);
      clearTimeout(stop);
    };
  }, [returning]);

  const needLogin = () => router.push({ pathname: '/login', params: { next: '/plus' } });

  const trial = async () => {
    if (!userId) return needLogin();
    setBusy('trial');
    try {
      await startTrial();
      success();
      notify('¡Arrancó tu mes gratis! 🎉', 'Todo el grupo tiene Plus durante 30 días. Cuando termine, vuelven al plan gratis sin que hagan nada.');
    } catch (e) {
      notify('No se pudo empezar la prueba', errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const buy = async () => {
    if (!userId) return needLogin();
    setBusy('buy');
    try {
      await subscribe(period);
    } catch (e) {
      notify('No se pudo abrir Mercado Pago', errorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen safeTop={false}>
      {returning && !active && (
        <Card tone="primarySoft">
          <T bold>⏳ Mercado Pago está confirmando el pago…</T>
          <T variant="label" tone="secondary">
            En unos segundos se activa solo. Podés seguir usando la app.
          </T>
        </Card>
      )}

      <View style={styles.header}>
        <T style={styles.logo}>💞</T>
        <T variant="title" center>
          {PLUS.name}
        </T>
        <T tone="secondary" center>
          {wanted && plan.tier === 'free'
            ? `${wanted.title} viene con Plus. Una suscripción alcanza para todo el grupo.`
            : 'Una sola suscripción para todo el grupo. Si uno la activa, la tienen todos.'}
        </T>
      </View>

      {plan.tier !== 'free' && (
        <Card>
          <HStack style={styles.between}>
            <T bold>
              {plan.tier === 'trial' ? '🎁 Están en el mes gratis' : plan.shared ? '💞 Tienen Plus gracias a tu grupo' : '✨ Tienen Parejo Plus'}
            </T>
            <Pill tone="positive" label={plan.daysLeft === 1 ? 'Queda 1 día' : `Quedan ${plan.daysLeft} días`} />
          </HStack>
          {plan.until && (
            <T variant="label" tone="secondary">
              {plan.tier === 'trial' ? 'Termina' : 'Sigue activo hasta'} el {shortDate(plan.until.slice(0, 10))} de {plan.until.slice(0, 4)}.
            </T>
          )}
        </Card>
      )}

      <Card>
        <VStack gap={Space.md}>
          {PLUS_FEATURES.map((f) => (
            <Feature key={f.id} icon={f.icon} title={f.title} body={f.body} highlight={f.id === feature} />
          ))}
        </VStack>
      </Card>

      {!active && (
        <VStack gap={Space.sm}>
          <PeriodOption
            selected={period === 'year'}
            onPress={() => setPeriod('year')}
            title="Anual"
            price={`USD ${usd(PLUS.prices.year)} por año`}
            detail={`Sale USD ${deal.perMonth} por mes`}
            badge={`Ahorran ${deal.savingPercent}%`}
          />
          <PeriodOption
            selected={period === 'month'}
            onPress={() => setPeriod('month')}
            title="Mensual"
            price={`USD ${usd(PLUS.prices.month)} por mes`}
            detail="Sin compromiso, mes a mes"
          />
        </VStack>
      )}

      {!syncEnabled ? (
        <Card tone="alt">
          <T tone="secondary">Plus necesita la versión con cuenta de Parejo.</T>
        </Card>
      ) : active ? null : (
        <VStack>
          {plan.canStartTrial && (
            <>
              <Button title="Probar un mes gratis" icon="🎁" loading={busy === 'trial'} onPress={trial} />
              <T variant="caption" tone="secondary" center>
                Sin tarjeta. Cuando termina, siguen en el plan gratis sin perder nada.
              </T>
            </>
          )}
          {Platform.OS === 'web' ? (
            <Button
              title={period === 'year' ? `Activar anual · USD ${usd(PLUS.prices.year)}` : `Activar mensual · USD ${usd(PLUS.prices.month)}`}
              variant={plan.canStartTrial ? 'secondary' : 'primary'}
              loading={busy === 'buy'}
              onPress={buy}
            />
          ) : (
            <T variant="caption" tone="secondary" center>
              Por ahora Plus se activa desde la web de Parejo. Después, aparece también en la app.
            </T>
          )}
          {Platform.OS === 'web' && (
            <T variant="caption" tone="secondary" center>
              Se paga con Mercado Pago, en pesos al cambio del día. Se cancela cuando quieras desde Mercado Pago.
            </T>
          )}
        </VStack>
      )}

      <Card tone="alt">
        <T variant="label" bold>
          Gratis, para siempre
        </T>
        <T variant="label" tone="secondary">
          Grupos, gastos, cuotas, fijos, metas, saldar y sincronización, sin límite. Además: {FREE_LIMITS.budgets} presupuestos,{' '}
          {FREE_LIMITS.tags} etiquetas y {FREE_LIMITS.voicePerMonth} dictados por mes. Sin publicidad.
        </T>
      </Card>

      {!userId && syncEnabled && (
        <T variant="caption" tone="secondary" center>
          Para activar Plus primero entrás con tu email.
        </T>
      )}
      <Button title={active ? 'Volver' : 'Ahora no'} variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
    </Screen>
  );
}

function PeriodOption({
  selected,
  onPress,
  title,
  price,
  detail,
  badge,
}: {
  selected: boolean;
  onPress: () => void;
  title: string;
  price: string;
  detail: string;
  badge?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[styles.option, { borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? theme.primarySoft : theme.card }]}>
      <View style={[styles.radio, { borderColor: selected ? theme.primary : theme.border }]}>
        {selected && <View style={[styles.radioDot, { backgroundColor: theme.primary }]} />}
      </View>
      <View style={styles.flex}>
        <HStack wrap>
          <T bold>{title}</T>
          {badge && <Pill tone="positive" label={badge} />}
        </HStack>
        <T variant="heading">{price}</T>
        <T variant="label" tone="secondary">
          {detail}
        </T>
      </View>
    </Pressable>
  );
}

function Feature({ icon, title, body, highlight }: { icon: string; title: string; body: string; highlight?: boolean }) {
  const theme = useTheme();
  return (
    <HStack style={[styles.feature, highlight && { backgroundColor: theme.primarySoft }]}>
      <T style={styles.featureIcon}>{icon}</T>
      <View style={styles.flex}>
        <T bold>{title}</T>
        <T variant="label" tone="secondary">
          {body}
        </T>
      </View>
    </HStack>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: Space.xs, paddingVertical: Space.md },
  logo: { fontSize: 44, lineHeight: 54 },
  between: { justifyContent: 'space-between' },
  option: { flexDirection: 'row', alignItems: 'center', gap: Space.md, padding: Space.lg, borderRadius: Radius.lg, borderWidth: 2 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  feature: { alignItems: 'flex-start', gap: Space.md, padding: Space.xs, borderRadius: Radius.sm },
  featureIcon: { fontSize: 22, lineHeight: 28, width: 30, textAlign: 'center' },
  flex: { flex: 1 },
});
