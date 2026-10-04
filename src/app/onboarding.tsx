import { router } from 'expo-router';
import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { makeMember } from '@/domain/demo';
import { parseAmount } from '@/domain/money';
import type { GroupKind } from '@/domain/types';
import { useStore } from '@/store';
import { syncEnabled } from '@/sync/runtime';
import { Button, ChipGroup, Field, Label } from '@/ui/controls';
import { Card, Screen, VStack } from '@/ui/layout';
import { T } from '@/ui/text';
import { Space } from '@/ui/theme';

const PROMISES = [
  { emoji: '⚖️', title: 'Cuentas claras, solas', body: 'Cada uno carga lo que paga. Parejo calcula quién le debe a quién.' },
  { emoji: '💳', title: 'Cuotas que se reparten mes a mes', body: 'La heladera en 12 cuotas se va sumando sola, cuota por cuota.' },
  { emoji: '📅', title: 'Los fijos, bajo control', body: 'Alquiler, expensas, luz: sabés qué vence y quién lo paga.' },
  { emoji: '🎯', title: 'Metas en pareja', body: 'Ahorren juntos para el viaje o la mudanza y vean cuánto falta.' },
  { emoji: '📐', title: 'Justo, no siempre 50/50', body: 'Dividan según lo que gana cada uno, si así lo sienten más justo.' },
];

const KINDS: { value: GroupKind; label: string; icon: string }[] = [
  { value: 'couple', label: 'Pareja', icon: '💜' },
  { value: 'home', label: 'Depto compartido', icon: '🏠' },
  { value: 'trip', label: 'Viaje', icon: '✈️' },
  { value: 'other', label: 'Otro', icon: '✨' },
];

export default function Onboarding() {
  const [step, setStep] = useState<'welcome' | 'setup'>('welcome');
  const hasGroups = useStore((s) => Object.keys(s.groups).length > 0);
  const loadDemo = useStore((s) => s.loadDemo);

  if (step === 'welcome') {
    return (
      <Screen>
        <View style={styles.hero}>
          <Image source={require('@/assets/images/icon.png')} style={styles.logo} accessibilityIgnoresInvertColors />
          <T variant="display" center>
            Parejo
          </T>
          <T variant="heading" tone="secondary" center>
            Del “después te paso” al “estamos parejos”.
          </T>
        </View>
        <VStack gap={Space.sm}>
          {PROMISES.map((p) => (
            <Card key={p.title} style={styles.promise}>
              <T style={styles.promiseEmoji}>{p.emoji}</T>
              <View style={styles.flex}>
                <T bold>{p.title}</T>
                <T variant="label" tone="secondary">
                  {p.body}
                </T>
              </View>
            </Card>
          ))}
        </VStack>
        <VStack>
          <Button title="Crear nuestro grupo" onPress={() => setStep('setup')} />
          <Button
            title="Probar con datos de ejemplo"
            variant="secondary"
            onPress={() => {
              loadDemo();
              router.replace('/');
            }}
          />
          {syncEnabled && (
            <>
              <Button title="Me invitaron a un grupo" variant="ghost" onPress={() => router.push('/join')} />
              <Button title="Ya tengo cuenta" variant="ghost" onPress={() => router.push('/login')} />
            </>
          )}
          {hasGroups && <Button title="Volver" variant="ghost" onPress={() => router.back()} />}
        </VStack>
      </Screen>
    );
  }
  return <Setup onBack={() => setStep('welcome')} />;
}

function Setup({ onBack }: { onBack: () => void }) {
  const createGroup = useStore((s) => s.createGroup);
  const [kind, setKind] = useState<GroupKind>('couple');
  const [myName, setMyName] = useState('');
  const [others, setOthers] = useState<string[]>(['']);
  const [groupName, setGroupName] = useState('');
  const [myIncome, setMyIncome] = useState('');
  const [otherIncome, setOtherIncome] = useState('');
  const [alias, setAlias] = useState('');

  const couple = kind === 'couple';
  const otherNames = (couple ? others.slice(0, 1) : others).map((n) => n.trim()).filter(Boolean);
  const valid = myName.trim().length > 0 && otherNames.length > 0;
  const suggestedName = couple && otherNames[0] ? `${myName.trim() || 'Yo'} & ${otherNames[0]}` : { home: 'Depto', trip: 'Viaje', other: 'Grupo', couple: 'Nosotros' }[kind];

  const create = () => {
    const me = makeMember(myName, 0, { alias: alias.trim() || undefined, income: couple ? (parseAmount(myIncome) ?? undefined) : undefined });
    const rest = otherNames.map((name, i) =>
      makeMember(name, i + 1, { income: couple && i === 0 ? (parseAmount(otherIncome) ?? undefined) : undefined }),
    );
    createGroup({
      name: groupName.trim() || suggestedName,
      kind,
      currency: 'ARS',
      members: [me, ...rest],
      meId: me.id,
      usdRate: 1200,
    });
    router.replace('/');
  };

  return (
    <Screen title="Armemos el grupo" subtitle="Tarda 30 segundos. Después lo podés cambiar todo.">
      <VStack gap={Space.sm}>
        <Label>¿Para qué es?</Label>
        <ChipGroup options={KINDS} value={kind} onChange={setKind} />
      </VStack>

      <Field label="Tu nombre" placeholder="Ej: Juli" value={myName} onChangeText={setMyName} autoFocus />

      {couple ? (
        <Field label="Tu pareja" placeholder="Ej: Sofi" value={others[0]} onChangeText={(v) => setOthers([v])} />
      ) : (
        <VStack gap={Space.sm}>
          <Label>¿Quiénes más?</Label>
          {others.map((name, i) => (
            <Field
              key={i}
              placeholder={`Persona ${i + 2}`}
              value={name}
              onChangeText={(v) => setOthers(others.map((x, j) => (j === i ? v : x)))}
            />
          ))}
          <Button title="Agregar otra persona" icon="＋" variant="ghost" small onPress={() => setOthers([...others, ''])} />
        </VStack>
      )}

      <Field label="Nombre del grupo" placeholder={suggestedName} value={groupName} onChangeText={setGroupName} />

      {couple && (
        <Card tone="alt">
          <VStack gap={Space.md}>
            <View>
              <T bold>📐 ¿Quieren dividir según lo que gana cada uno?</T>
              <T variant="label" tone="secondary">
                Opcional. Si uno gana el doble, pone el doble en los gastos que elijan. Queda solo en tu dispositivo.
              </T>
            </View>
            <Field label={`Ingreso mensual de ${myName.trim() || 'vos'}`} placeholder="Ej: 1.800.000" keyboardType="decimal-pad" inputMode="decimal" value={myIncome} onChangeText={setMyIncome} />
            <Field label={`Ingreso mensual de ${others[0]?.trim() || 'tu pareja'}`} placeholder="Ej: 1.200.000" keyboardType="decimal-pad" inputMode="decimal" value={otherIncome} onChangeText={setOtherIncome} />
          </VStack>
        </Card>
      )}

      <Field label="Tu alias o CVU (opcional)" hint="Para que te paguen en un toque." placeholder="Ej: juli.parejo.mp" autoCapitalize="none" value={alias} onChangeText={setAlias} />

      <VStack>
        <Button title="Listo, empezar" disabled={!valid} onPress={create} />
        <Button title="Volver" variant="ghost" onPress={onBack} />
      </VStack>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: Space.sm, paddingTop: Space.xl, paddingBottom: Space.md },
  logo: { width: 88, height: 88, borderRadius: 24, marginBottom: Space.sm },
  promise: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  promiseEmoji: { fontSize: 28, lineHeight: 34 },
  flex: { flex: 1 },
});
