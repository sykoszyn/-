import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import type { Group, Member } from '@/domain/types';
import { createInviteMessage, signOut, syncNow, syncEnabled, uploadActiveGroup, useSync } from '@/sync/runtime';
import { confirm, notify, Pill, shareText } from '@/ui/bits';
import { Button } from '@/ui/controls';
import { Card, HStack, VStack } from '@/ui/layout';
import { T } from '@/ui/text';
import { Space } from '@/ui/theme';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function ago(ts: number | null): string {
  if (!ts) return '';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'recién';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  return `hace ${Math.round(s / 3600)} h`;
}

/** Invita a un miembro: pide iniciar sesión si hace falta, sube el grupo y abre el menú de compartir. */
export function useInvite() {
  const userId = useSync((s) => s.userId);
  const [busy, setBusy] = useState(false);
  const invite = async (group: Group, member: Member | null) => {
    if (!userId) {
      router.push({ pathname: '/login', params: { next: '/settings' } });
      return;
    }
    setBusy(true);
    try {
      await shareText(await createInviteMessage(group.id, member?.id ?? null));
    } catch (e) {
      notify('No se pudo crear la invitación', errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return { invite, busy };
}

/** Estado de la cuenta y la sincronización, para Ajustes. */
export function AccountCard({ group }: { group: Group }) {
  const { userId, email, status, error, lastSyncAt } = useSync();
  const [uploading, setUploading] = useState(false);

  if (!syncEnabled) return null;

  if (!userId) {
    return (
      <Card tone="primarySoft">
        <VStack gap={Space.md}>
          <View>
            <T bold>☁️ Guardá tus cuentas en la nube</T>
            <T variant="label" tone="secondary">
              Entrá con tu email para que tu pareja vea lo mismo desde su celular y no pierdas nada si cambiás de teléfono.
            </T>
          </View>
          <Button title="Entrar con mi email" onPress={() => router.push({ pathname: '/login', params: { next: '/settings' } })} />
        </VStack>
      </Card>
    );
  }

  const upload = async () => {
    setUploading(true);
    try {
      await uploadActiveGroup();
    } catch (e) {
      notify('No se pudo subir el grupo', errorText(e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <VStack gap={Space.md}>
        <HStack style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <T variant="caption" tone="secondary">
              Entraste como
            </T>
            <T bold numberOfLines={1}>
              {email}
            </T>
          </View>
          {status === 'syncing' ? (
            <Pill tone="primary" label="Sincronizando…" />
          ) : status === 'error' ? (
            <Pill tone="warning" label="Pendiente" />
          ) : (
            <Pill tone="positive" label={`✓ Al día ${ago(lastSyncAt)}`} />
          )}
        </HStack>
        {status === 'error' && error && (
          <T variant="caption" tone="warning">
            {error}
          </T>
        )}
        {group.remote ? (
          <T variant="label" tone="secondary">
            ☁️ “{group.name}” está en la nube: lo que cargue cualquiera aparece en los celulares de todos.
          </T>
        ) : (
          <VStack>
            <T variant="label" tone="secondary">
              “{group.name}” todavía está solo en este dispositivo.
            </T>
            <Button title="Subir este grupo a la nube" icon="☁️" variant="secondary" loading={uploading} onPress={upload} />
          </VStack>
        )}
        <HStack wrap>
          <Button title="Sincronizar ahora" small variant="ghost" onPress={() => syncNow()} />
          <Button
            title="Cerrar sesión"
            small
            variant="ghost"
            onPress={async () => {
              if (await confirm('¿Cerrar sesión?', 'Los grupos compartidos se quitan de este dispositivo, pero siguen guardados en la nube.', 'Cerrar sesión')) {
                await signOut();
                router.dismissTo('/');
              }
            }}
          />
        </HStack>
      </VStack>
    </Card>
  );
}
