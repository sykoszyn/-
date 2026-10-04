import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { AppState, Platform } from 'react-native';

import { SupabaseRemote } from './remote-supabase';
import type { Remote } from './types';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** `false` si la app se compiló sin las claves de Supabase: funciona igual, solo local. */
export const syncEnabled = Boolean(url && key);

export const supabase: SupabaseClient | null = syncEnabled
  ? createClient(url!, key!, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
      },
    })
  : null;

// En el celular, refrescar la sesión solo mientras la app está abierta.
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

/** Link para compartir una invitación. */
export function inviteUrl(code: string): string {
  const base = process.env.EXPO_PUBLIC_APP_URL || (Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : '');
  return base ? `${base.replace(/\/$/, '')}/join/${code}` : Linking.createURL(`/join/${code}`);
}

export const remote: Remote | null = supabase ? new SupabaseRemote(supabase) : null;
