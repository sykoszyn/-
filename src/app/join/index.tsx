import { router } from 'expo-router';
import { useState } from 'react';

import { syncEnabled } from '@/sync/runtime';
import { EmptyState } from '@/ui/bits';
import { Button, Field } from '@/ui/controls';
import { Screen } from '@/ui/layout';
import { T } from '@/ui/text';

/** Para quien recibió el código por mensaje y no tocó el link. */
export default function JoinWithCode() {
  const [code, setCode] = useState('');
  const clean = code.trim().replace(/^.*\/join\//, '');

  if (!syncEnabled) {
    return (
      <Screen safeTop={false}>
        <EmptyState emoji="☁️" title="Esta versión no tiene sincronización" body="Las invitaciones necesitan la versión conectada de Parejo." />
      </Screen>
    );
  }

  return (
    <Screen safeTop={false}>
      <T tone="secondary">Pegá el código o el link que te mandaron.</T>
      <Field label="Código de invitación" placeholder="ej: 3fa9c21b7e04" autoCapitalize="none" autoFocus value={code} onChangeText={setCode} />
      <Button title="Seguir" disabled={clean.length < 6} onPress={() => router.push({ pathname: '/join/[code]', params: { code: clean } })} />
    </Screen>
  );
}
