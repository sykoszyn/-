import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { shortDate } from '@/domain/dates';
import { FREE_LIMITS, monthlyEquivalent, PRO, PRO_FEATURES, type ProFeature } from '@/domain/plan';
import { refreshPlan, startTrial, subscribe, usePlan } from '@/pro/client';
import { useMaybeGroup } from '@/store';
import { syncEnabled, useSync } from '@/sync/runtime';
import { notify, Pill, success } from '@/ui/bits';
import { Button } from '@/ui/controls';
import { Card, HStack, Screen, VStack } from '@/ui/layout';
import { T } from '@/ui/text';
import { Radius, Space, useTheme } from '@/ui/theme';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function ProScreen() {
  const { feature, status } = useLocalSearchParams<{ feature?: ProFeature; status?: string }>();
  const group = useMaybeGroup();
  const plan = usePlan(group);
  const userId = useSync((s) => s.userId);
  const [busy, setBusy] = useState<'trial' | 'buy' | null>(null);
  const locked = PRO_FEATURES.find((f) => f.id === feature);
  const returning = status === 'ok' || status === 'pending';

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

  const needLogin = () => router.push({ pathname: '/login', params: { next: '/pro' } });

  const trial = async () => {
    if (!userId) return needLogin();
    setBusy('trial');
    try {
      await startTrial();
      success();
      notify('¡Listo! 🎉', `Tenés Parejo Pro gratis por ${PRO.trialDays} días. Si tu pareja está en el grupo, también lo tiene.`);
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
      await subscribe();
    } catch (e) {
      notify('No se pudo abrir Mercado Pago', errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const proActive = plan.tier === 'pro';

  return (
    <Screen safeTop={false}>
      {locked && plan.tier === 'free' && (
        <Card tone="primarySoft">
          <T bold>
            🔒 {locked.title} es parte de Pro
          </T>
        </Card>
      )}

      {returning && !proActive && (
        <Card tone="primarySoft">
          <T bold>⏳ Estamos confirmando el pago con Mercado Pago…</T>
          <T variant="label" tone="secondary">
            Suele tardar unos segundos. Podés seguir usando la app: Pro se activa solo.
          </T>
        </Card>
      )}

      <Card tone="hero" style={styles.hero}>
        <HStack style={styles.between}>
          <T variant="title" tone="onHero">
            Parejo Pro
          </T>
          <View style={styles.optional}>
            <T variant="caption" bold tone="onHero">
              OPCIONAL
            </T>
          </View>
        </HStack>
        <HStack style={styles.price}>
          <T variant="display" tone="onHero">
            USD {PRO.priceUsdYear}
          </T>
          <T tone="onHeroSecondary">por año</T>
        </HStack>
        <T variant="label" tone="onHeroSecondary">
          Sale USD {monthlyEquivalent(PRO.priceUsdYear)} por mes, cobrado una vez al año.
        </T>
        <View style={[styles.trialNote, { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
          <T variant="label" tone="onHero">
            ✅ Probalo gratis {PRO.trialDays} días, sin tarjeta. Si no te convence, no pagás nada.
          </T>
        </View>
      </Card>

      {plan.tier !== 'free' && (
        <Card>
          <HStack style={styles.between}>
            <T bold>
              {plan.tier === 'trial' ? '🎁 Estás en la prueba gratis' : plan.shared ? '💜 Tenés Pro gracias a tu grupo' : '⭐ Tenés Parejo Pro'}
            </T>
            <Pill tone="positive" label={plan.daysLeft === 1 ? 'Queda 1 día' : `Quedan ${plan.daysLeft} días`} />
          </HStack>
          {plan.until && (
            <T variant="label" tone="secondary">
              {plan.tier === 'trial' ? 'Termina' : 'Activo hasta'} el {shortDate(plan.until.slice(0, 10))} de {plan.until.slice(0, 4)}.
            </T>
          )}
        </Card>
      )}

      <Card>
        <VStack gap={Space.md}>
          <Feature icon="✅" title="Todo lo del plan gratis" body="Grupos, gastos, cuotas, fijos, metas, saldar y sincronización. Para siempre." />
          {PRO_FEATURES.map((f) => (
            <Feature key={f.id} icon={f.icon} title={f.title} body={f.body} highlight={f.id === feature} />
          ))}
          <Feature icon="💜" title="Pro para los dos" body="Si uno lo paga, todo el grupo lo tiene. No hace falta pagar dos veces." />
        </VStack>
      </Card>

      <T variant="caption" tone="secondary" center>
        Plan gratis: {FREE_LIMITS.budgets} presupuestos, {FREE_LIMITS.tags} etiquetas y {FREE_LIMITS.voicePerMonth} cargas por voz por mes. Sin anuncios
        en ningún plan.
      </T>

      {!syncEnabled ? (
        <Card tone="alt">
          <T tone="secondary">Pro necesita la versión conectada de Parejo (con cuenta).</T>
        </Card>
      ) : proActive ? null : (
        <VStack>
          {plan.canStartTrial && (
            <Button title={`Probar ${PRO.trialDays} días gratis`} icon="🎁" loading={busy === 'trial'} onPress={trial} />
          )}
          {Platform.OS === 'web' ? (
            <Button
              title={`Suscribirme · USD ${PRO.priceUsdYear}/año`}
              variant={plan.canStartTrial ? 'secondary' : 'primary'}
              loading={busy === 'buy'}
              onPress={buy}
            />
          ) : (
            <T variant="caption" tone="secondary" center>
              Por ahora la suscripción se hace desde la web de Parejo. Después de pagar, Pro se activa también acá.
            </T>
          )}
          {Platform.OS === 'web' && (
            <T variant="caption" tone="secondary" center>
              Pagás con Mercado Pago (en pesos, al cambio del día). Lo cancelás cuando quieras desde tu cuenta de Mercado Pago.
            </T>
          )}
        </VStack>
      )}

      {!userId && syncEnabled && (
        <T variant="caption" tone="secondary" center>
          Para probar o suscribirte, primero entrás con tu email.
        </T>
      )}
      <Button title={proActive ? 'Volver' : 'Ahora no'} variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
    </Screen>
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
  hero: { gap: Space.sm, paddingVertical: Space.xl },
  between: { justifyContent: 'space-between' },
  optional: { paddingHorizontal: Space.sm, paddingVertical: 3, borderRadius: Radius.pill, backgroundColor: 'rgba(255,255,255,0.18)' },
  price: { alignItems: 'baseline', marginTop: Space.sm },
  trialNote: { marginTop: Space.sm, padding: Space.md, borderRadius: Radius.md },
  feature: { alignItems: 'flex-start', gap: Space.md, padding: Space.xs, borderRadius: Radius.sm },
  featureIcon: { fontSize: 22, lineHeight: 28, width: 30, textAlign: 'center' },
  flex: { flex: 1 },
});
