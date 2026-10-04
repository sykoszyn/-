import { useEffect } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import { create } from 'zustand';

import { FREE_PLAN, resolvePlan, type Plan, type Profile } from '@/domain/plan';
import type { Group } from '@/domain/types';
import { supabase } from '@/sync/supabase';
import { useSync } from '@/sync/runtime';

import { callApi } from './api';
import { refreshMercadoPago } from './mercadopago';

type PlanState = {
  profile: Profile | null;
  /** Por grupo: hasta cuándo tiene Pro gracias a otra persona del grupo. */
  groupUntil: Record<string, string>;
  loaded: boolean;
};

export const usePlanStore = create<PlanState>(() => ({ profile: null, groupUntil: {}, loaded: false }));

export async function refreshPlan(): Promise<void> {
  if (!supabase || !useSync.getState().userId) {
    usePlanStore.setState({ profile: null, groupUntil: {}, loaded: true });
    return;
  }
  const { data, error } = await supabase.rpc('plan_status');
  if (error) throw new Error(error.message);
  const status = data as { trial_started_at: string | null; pro_until: string | null; groups: { group_id: string; until: string }[] };
  usePlanStore.setState({
    profile: { trialStartedAt: status.trial_started_at, proUntil: status.pro_until },
    groupUntil: Object.fromEntries(status.groups.map((g) => [g.group_id, g.until])),
    loaded: true,
  });
}

export async function startTrial(): Promise<void> {
  if (!supabase) throw new Error('La sincronización no está configurada');
  const { error } = await supabase.rpc('start_trial');
  if (error) throw new Error(error.message);
  await refreshPlan();
}

/** Abre el checkout de Mercado Pago para la suscripción anual. */
export async function subscribe(): Promise<void> {
  const { url } = await callApi<{ url: string }>('/api/mp/subscribe');
  if (Platform.OS === 'web') window.location.href = url;
  else await Linking.openURL(url);
}

/** El plan efectivo para el grupo activo (el propio o el que comparte otra persona del grupo). */
export function usePlan(group?: Group): Plan {
  const { profile, groupUntil } = usePlanStore();
  const userId = useSync((s) => s.userId);
  if (!userId) return FREE_PLAN;
  return resolvePlan(profile, new Date(), group?.remote ? (groupUntil[group.id] ?? null) : null);
}

/** Mantiene el plan al día: al entrar, al volver a la app y al volver del checkout. */
export function PlanManager() {
  const userId = useSync((s) => s.userId);
  useEffect(() => {
    const refresh = () => {
      refreshPlan().catch(() => {});
      if (userId) refreshMercadoPago().catch(() => {});
    };
    refresh();
    if (!userId) return;
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    const interval = setInterval(refresh, 5 * 60_000);
    return () => {
      sub.remove();
      clearInterval(interval);
    };
  }, [userId]);
  return null;
}
