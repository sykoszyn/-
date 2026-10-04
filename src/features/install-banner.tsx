import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';

import { Button } from '@/ui/controls';
import { Card, HStack, VStack } from '@/ui/layout';
import { T } from '@/ui/text';

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
type InstallWindow = Window & { __parejoInstallPrompt?: PromptEvent };

const KEY = 'parejo-install-dismissed';

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function dismissed() {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** En la web: invita a instalar Parejo como app (Android/Chrome con el aviso nativo, iPhone con instrucciones). */
export function InstallBanner() {
  const [prompt, setPrompt] = useState<PromptEvent | null>(() => (Platform.OS === 'web' ? ((window as InstallWindow).__parejoInstallPrompt ?? null) : null));
  const [mode, setMode] = useState<'hidden' | 'prompt' | 'ios'>(() => {
    if (Platform.OS !== 'web' || isStandalone() || dismissed()) return 'hidden';
    if ((window as InstallWindow).__parejoInstallPrompt) return 'prompt';
    return isIOS() ? 'ios' : 'hidden';
  });

  useEffect(() => {
    if (Platform.OS !== 'web' || isStandalone() || dismissed()) return;
    // El navegador avisa que se puede instalar (a veces después de que cargó la app).
    const update = () => {
      const p = (window as InstallWindow).__parejoInstallPrompt;
      if (!p) return;
      setPrompt(p);
      setMode('prompt');
    };
    window.addEventListener('parejo-installable', update);
    return () => window.removeEventListener('parejo-installable', update);
  }, []);

  if (mode === 'hidden') return null;

  const close = () => {
    try {
      localStorage.setItem(KEY, '1');
    } catch {}
    setMode('hidden');
  };

  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    (window as InstallWindow).__parejoInstallPrompt = undefined;
    setMode('hidden');
  };

  return (
    <Card tone="alt">
      <VStack>
        <T bold>📲 Tené Parejo como app</T>
        <T variant="label" tone="secondary">
          {mode === 'ios'
            ? 'En Safari tocá Compartir (el cuadrado con la flecha) y después “Agregar a inicio”. Se abre a pantalla completa, como cualquier app.'
            : 'Instalala en tu celu o compu: se abre a pantalla completa y funciona sin conexión.'}
        </T>
        <HStack>
          {mode === 'prompt' && <Button title="Instalar" small onPress={install} />}
          <View>
            <Button title={mode === 'ios' ? 'Entendido' : 'Ahora no'} small variant="ghost" onPress={close} />
          </View>
        </HStack>
      </VStack>
    </Card>
  );
}
