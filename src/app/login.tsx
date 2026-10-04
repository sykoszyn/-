import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';

import { sendLoginCode, syncNow, useSync, verifyLoginCode } from '@/sync/runtime';
import { Button, Field } from '@/ui/controls';
import { Card, Screen, VStack } from '@/ui/layout';
import { T } from '@/ui/text';
import { Space } from '@/ui/theme';

export default function Login() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signedInAs = useSync((s) => s.email);

  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim());

  const send = async () => {
    setLoading(true);
    setError(null);
    try {
      await sendLoginCode(email);
      setStep('code');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const verify = async () => {
    setLoading(true);
    setError(null);
    try {
      await verifyLoginCode(email, code);
      await syncNow();
      router.replace((next || '/') as Href);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  if (signedInAs && step === 'email') {
    return (
      <Screen safeTop={false}>
        <Card>
          <T>
            Ya entraste como <T bold>{signedInAs}</T>.
          </T>
        </Card>
        <Button title="Seguir" onPress={() => router.replace((next || '/') as Href)} />
      </Screen>
    );
  }

  return (
    <Screen safeTop={false}>
      <VStack gap={Space.xs}>
        <T variant="title">{step === 'email' ? 'Entrá a Parejo' : 'Revisá tu mail'}</T>
        <T tone="secondary">
          {step === 'email'
            ? 'Con tu cuenta, tus grupos quedan guardados en la nube y los ven todos los que forman parte, cada uno desde su celular.'
            : `Te mandamos un código de 6 dígitos a ${email.trim()}. Puede tardar un minuto; fijate en spam.`}
        </T>
      </VStack>

      {step === 'email' ? (
        <>
          <Field
            label="Tu email"
            placeholder="vos@ejemplo.com"
            keyboardType="email-address"
            inputMode="email"
            autoCapitalize="none"
            autoComplete="email"
            autoFocus
            value={email}
            onChangeText={setEmail}
            onSubmitEditing={() => validEmail && send()}
          />
          <Button title="Mandarme un código" disabled={!validEmail} loading={loading} onPress={send} />
          <T variant="caption" tone="secondary" center>
            Sin contraseñas: cada vez que entres te llega un código nuevo.
          </T>
        </>
      ) : (
        <>
          <Field
            label="Código"
            placeholder="123456"
            keyboardType="number-pad"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={10}
            autoFocus
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, ''))}
            onSubmitEditing={() => code.length >= 6 && verify()}
          />
          <Button title="Entrar" disabled={code.length < 6} loading={loading} onPress={verify} />
          <Button title="Usar otro email" variant="ghost" onPress={() => setStep('email')} />
        </>
      )}

      {error && (
        <Card tone="alt">
          <T tone="negative">{error}</T>
        </Card>
      )}
    </Screen>
  );
}
