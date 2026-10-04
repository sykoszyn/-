import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import type { InvitePreview } from '@/sync/types';
import { joinGroup, previewInvite, syncEnabled, useSync } from '@/sync/runtime';
import { EmptyState, success } from '@/ui/bits';
import { Button, Field } from '@/ui/controls';
import { Card, Screen, VStack } from '@/ui/layout';
import { T } from '@/ui/text';
import { Space } from '@/ui/theme';

export default function JoinGroup() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const userId = useSync((s) => s.userId);
  const ready = useSync((s) => s.ready);
  const [preview, setPreview] = useState<InvitePreview | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!syncEnabled) return;
    previewInvite(code)
      .then(setPreview)
      .catch((e) => {
        setPreview(null);
        setError(e instanceof Error ? e.message : String(e));
      });
  }, [code]);

  if (!syncEnabled) {
    return (
      <Screen safeTop={false}>
        <EmptyState emoji="☁️" title="Esta versión no tiene sincronización" />
      </Screen>
    );
  }
  if (preview === undefined || !ready) {
    return (
      <Screen safeTop={false}>
        <ActivityIndicator style={styles.loading} />
      </Screen>
    );
  }
  if (preview === null) {
    return (
      <Screen safeTop={false}>
        <EmptyState emoji="🤔" title="No encontramos esa invitación" body={error ?? 'Revisá el código o pedí uno nuevo.'} />
        <Button title="Probar otro código" variant="secondary" onPress={() => router.replace('/join')} />
      </Screen>
    );
  }

  const join = async () => {
    setJoining(true);
    setError(null);
    try {
      await joinGroup(code, name.trim() || undefined);
      success();
      if (router.canDismiss()) router.dismissAll();
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setJoining(false);
    }
  };

  const usable = preview.status === 'ok';

  return (
    <Screen safeTop={false}>
      <Card tone="hero" style={styles.hero}>
        <T style={styles.emoji}>💌</T>
        <T variant="label" tone="onHeroSecondary" center>
          {preview.inviterName ? `${preview.inviterName} te invitó a` : 'Te invitaron a'}
        </T>
        <T variant="title" tone="onHero" center>
          {preview.groupName}
        </T>
        {preview.memberName && (
          <T tone="onHeroSecondary" center>
            Vas a entrar como {preview.memberName}, con todo lo que ya cargaron.
          </T>
        )}
      </Card>

      {!usable ? (
        <Card>
          <T tone="negative">
            {preview.status === 'used' ? 'Esta invitación ya se usó.' : 'Esta invitación venció.'} Pedí una nueva.
          </T>
        </Card>
      ) : !userId ? (
        <VStack>
          <T tone="secondary" center>
            Primero entrá con tu email, así tus cuentas quedan guardadas.
          </T>
          <Button title="Entrar para unirme" onPress={() => router.push({ pathname: '/login', params: { next: `/join/${code}` } })} />
        </VStack>
      ) : (
        <VStack gap={Space.md}>
          {!preview.memberName && <Field label="¿Cómo te llamás?" placeholder="Tu nombre" value={name} onChangeText={setName} />}
          <Button title="Unirme" icon="🤝" loading={joining} onPress={join} />
        </VStack>
      )}

      {error && (
        <Card tone="alt">
          <T tone="negative">{error}</T>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: Space.xxl },
  hero: { alignItems: 'center', gap: Space.sm, paddingVertical: Space.xl },
  emoji: { fontSize: 44, lineHeight: 54 },
});
