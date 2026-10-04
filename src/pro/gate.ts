import { router } from 'expo-router';

import type { ProFeature } from '@/domain/plan';

/** Lleva a la pantalla de Pro, resaltando la función que se quiso usar. */
export function goPro(feature?: ProFeature) {
  router.push({ pathname: '/pro', params: feature ? { feature } : {} });
}
