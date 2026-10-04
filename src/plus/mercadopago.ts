import { Linking, Platform } from 'react-native';
import { create } from 'zustand';

import { supabase } from '@/sync/supabase';

import { callApi } from './api';

/** Un pago traído de Mercado Pago, esperando que lo carguen o lo descarten. */
export type InboxItem = {
  id: string;
  direction: 'out' | 'in';
  amount: number;
  currency: 'ARS' | 'USD';
  description: string;
  counterpart: string | null;
  date: string;
};

type MpState = { connected: boolean; lastSyncedAt: string | null; inbox: InboxItem[]; loaded: boolean };

export const useMercadoPago = create<MpState>(() => ({ connected: false, lastSyncedAt: null, inbox: [], loaded: false }));

export async function refreshMercadoPago(): Promise<void> {
  if (!supabase) return;
  const [status, inbox] = await Promise.all([
    supabase.rpc('mp_status'),
    supabase.from('mp_inbox').select('id, direction, amount, currency, description, counterpart, date').eq('status', 'pending').order('date', { ascending: false }).limit(100),
  ]);
  if (status.error) throw new Error(status.error.message);
  if (inbox.error) throw new Error(inbox.error.message);
  const s = status.data as { connected: boolean; last_synced_at: string | null };
  useMercadoPago.setState({ connected: s.connected, lastSyncedAt: s.last_synced_at, inbox: (inbox.data ?? []) as InboxItem[], loaded: true });
}

/** Marca un pago de la bandeja como cargado o descartado. */
export async function markInboxItem(id: string, status: 'added' | 'dismissed'): Promise<void> {
  useMercadoPago.setState((s) => ({ inbox: s.inbox.filter((i) => i.id !== id) }));
  if (!supabase) return;
  const { error } = await supabase.from('mp_inbox').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Abre Mercado Pago para autorizar a Parejo a leer los pagos. */
export async function connectMercadoPago(): Promise<void> {
  const { url } = await callApi<{ url: string }>('/api/mp/connect');
  if (Platform.OS === 'web') window.location.href = url;
  else await Linking.openURL(url);
}

/** Pide al servidor que traiga los pagos nuevos ya mismo. */
export async function syncMercadoPago(): Promise<number> {
  const { added } = await callApi<{ added: number }>('/api/mp/sync');
  await refreshMercadoPago();
  return added;
}

export async function disconnectMercadoPago(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc('mp_disconnect');
  if (error) throw new Error(error.message);
  useMercadoPago.setState({ connected: false, inbox: [] });
}
