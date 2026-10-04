import { router } from 'expo-router';

import type { PlusFeature } from '@/domain/plan';

/** Lleva a la pantalla de Plus, resaltando la función que se quiso usar. */
export function goPlus(feature?: PlusFeature) {
  router.push({ pathname: '/plus', params: feature ? { feature } : {} });
}
