import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { today } from '@/domain/dates';
import { groupSheets } from '@/domain/export';
import type { Group } from '@/domain/types';
import { buildXlsx } from '@/domain/xlsx';

const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function fileName(group: Group) {
  const slug = group.name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `parejo-${slug || 'grupo'}-${today()}.xlsx`;
}

/** Arma la planilla del grupo y la descarga (web) o abre el menú para compartirla (celular). */
export async function exportGroupToExcel(group: Group): Promise<void> {
  const bytes = buildXlsx(groupSheets(group));
  const name = fileName(group);

  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: MIME }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return;
  }

  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(bytes);
  await Sharing.shareAsync(file.uri, { mimeType: MIME, UTI: 'org.openxmlformats.spreadsheetml.sheet', dialogTitle: 'Exportar a Excel' });
}
