import { useState } from 'react';

import { isPro } from '@/domain/plan';
import type { Group } from '@/domain/types';
import { usePlan } from '@/pro/client';
import { goPro } from '@/pro/gate';
import { notify } from '@/ui/bits';
import { Button } from '@/ui/controls';

import { exportGroupToExcel } from './export';

/** Botón de exportar a Excel (Pro). */
export function ExcelButton({ group }: { group: Group }) {
  const plan = usePlan(group);
  const [busy, setBusy] = useState(false);
  return (
    <Button
      title={isPro(plan) ? 'Exportar a Excel' : 'Exportar a Excel ⭐'}
      icon="📥"
      variant="secondary"
      small
      loading={busy}
      onPress={async () => {
        if (!isPro(plan)) return goPro('excel');
        setBusy(true);
        try {
          await exportGroupToExcel(group);
        } catch (e) {
          notify('No se pudo exportar', e instanceof Error ? e.message : String(e));
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}
