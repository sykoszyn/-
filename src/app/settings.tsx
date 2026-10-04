import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { makeMember } from '@/domain/demo';
import { centsToInput, formatMoney, parseAmount } from '@/domain/money';
import type { Group, Member } from '@/domain/types';
import { AccountCard, useInvite } from '@/features/account';
import { useGroup, useMaybeGroup, useStore } from '@/store';
import { leaveGroup, syncEnabled } from '@/sync/runtime';
import { Avatar, confirm, notify, Pill, shareText } from '@/ui/bits';
import { Button, Chip, Field, Label } from '@/ui/controls';
import { Card, HStack, Row, Screen, Section, VStack } from '@/ui/layout';
import { T } from '@/ui/text';
import { Space } from '@/ui/theme';

const EMOJIS = ['🦊', '🐼', '🐨', '🦁', '🐸', '🐙', '🐯', '🐻', '🐰', '🦄', '🐝', '🐧'];

export default function Settings() {
  const group = useMaybeGroup();
  if (!group) return null;
  return <SettingsBody group={group} />;
}

function SettingsBody({ group }: { group: Group }) {
  const groups = useStore((s) => s.groups);
  const { updateGroup, switchGroup, deleteGroup, addMember } = useStore.getState();
  const [name, setName] = useState(group.name);
  const [rateText, setRateText] = useState(String(group.usdRate));
  const [newMember, setNewMember] = useState('');

  return (
    <Screen safeTop={false}>
      {syncEnabled && (
        <Section title="Cuenta">
          <AccountCard group={group} />
        </Section>
      )}

      <Section title="Grupo">
        <Card>
          <VStack gap={Space.md}>
            <Field label="Nombre" value={name} onChangeText={setName} onBlur={() => name.trim() && updateGroup({ name: name.trim() })} />
            <Field
              label="Dólar de referencia"
              hint="Se usa como valor por defecto al cargar gastos en dólares."
              keyboardType="decimal-pad"
              inputMode="decimal"
              value={rateText}
              onChangeText={setRateText}
              onBlur={() => {
                const rate = Number(rateText.replace(',', '.'));
                if (rate > 0) updateGroup({ usdRate: rate });
              }}
            />
            {!group.remote && (
              <VStack gap={Space.sm}>
                <Label>¿Quién sos vos?</Label>
                <HStack wrap>
                  {group.members.map((m) => (
                    <Chip key={m.id} label={m.name} icon={m.emoji} selected={group.meId === m.id} onPress={() => updateGroup({ meId: m.id })} />
                  ))}
                </HStack>
              </VStack>
            )}
          </VStack>
        </Card>
      </Section>

      <Section title="Personas">
        {group.members.map((m) => (
          <MemberCard key={m.id} member={m} />
        ))}
        <Card tone="alt">
          <HStack>
            <View style={styles.flex}>
              <Field placeholder="Sumar a alguien más" value={newMember} onChangeText={setNewMember} />
            </View>
            <Button
              title="Sumar"
              small
              disabled={!newMember.trim()}
              onPress={() => {
                addMember(makeMember(newMember, group.members.length));
                setNewMember('');
              }}
            />
          </HStack>
        </Card>
      </Section>

      <Section title="Mis grupos">
        <Card>
          {Object.values(groups).map((g, i, arr) => (
            <Row
              key={g.id}
              icon={g.kind === 'couple' ? '💜' : g.kind === 'home' ? '🏠' : g.kind === 'trip' ? '✈️' : '✨'}
              title={g.name}
              subtitle={`${g.remote ? '☁️ ' : ''}${g.members.map((m) => m.name).join(', ')}`}
              right={g.id === group.id ? 'Activo' : undefined}
              rightTone="secondary"
              onPress={() => {
                switchGroup(g.id);
                router.dismissTo('/');
              }}
              last={i === arr.length - 1}
            />
          ))}
        </Card>
        <Button title="Crear otro grupo" variant="secondary" onPress={() => router.push('/onboarding')} />
      </Section>

      <Section title="Tus datos">
        <Card>
          <VStack>
            <T variant="label" tone="secondary">
              {group.remote
                ? 'Este grupo se guarda en la nube. Igual podés exportar una copia cuando quieras.'
                : 'Este grupo se guarda solo en este dispositivo. Podés exportar una copia cuando quieras.'}
            </T>
            <Button title="Exportar copia (JSON)" variant="secondary" small onPress={() => shareText(JSON.stringify(group, null, 2))} />
          </VStack>
        </Card>
        {group.remote ? (
          <Button
            title="Salir de este grupo"
            variant="danger"
            onPress={async () => {
              if (
                await confirm(
                  `¿Salir de "${group.name}"?`,
                  'Dejás de verlo en tus dispositivos. Los demás lo siguen usando y vos seguís figurando en las cuentas.',
                  'Salir',
                )
              ) {
                try {
                  await leaveGroup(group.id);
                  router.dismissTo('/');
                } catch (e) {
                  notify('No se pudo salir del grupo', e instanceof Error ? e.message : String(e));
                }
              }
            }}
          />
        ) : (
          <Button
            title="Borrar este grupo"
            variant="danger"
            onPress={async () => {
              if (await confirm(`¿Borrar "${group.name}"?`, 'Se borran todos sus gastos, fijos y metas. No se puede deshacer.')) {
                deleteGroup(group.id);
                router.dismissTo('/');
              }
            }}
          />
        )}
      </Section>
      <T variant="caption" tone="secondary" center>
        Parejo · versión 1.0 · Hecho con 💜 en Argentina
      </T>
    </Screen>
  );
}

function MemberCard({ member }: { member: Member }) {
  const group = useGroup();
  const updateMember = useStore((s) => s.updateMember);
  const [name, setName] = useState(member.name);
  const [incomeText, setIncomeText] = useState(member.income ? centsToInput(member.income) : '');
  const [alias, setAlias] = useState(member.alias ?? '');
  const [open, setOpen] = useState(false);
  const { invite, busy } = useInvite();
  const isMe = member.id === group.meId;

  return (
    <Card>
      <HStack>
        <Avatar member={member} size={40} />
        <View style={styles.flex}>
          <T bold>
            {member.name}
            {member.id === group.meId ? ' (vos)' : ''}
          </T>
          <T variant="caption" tone="secondary">
            {[member.alias, member.income ? `gana ${formatMoney(member.income, group.currency)}` : null].filter(Boolean).join(' · ') || 'Sin alias ni ingreso'}
          </T>
        </View>
        {!open && <Button title="Editar" small variant="ghost" onPress={() => setOpen(true)} />}
      </HStack>
      {syncEnabled && !isMe && (
        <HStack style={styles.mt}>
          {member.userId ? (
            <Pill tone="positive" label="✓ Usa Parejo en su celular" />
          ) : (
            <Button title={`Invitar a ${member.name}`} icon="💌" small variant="secondary" loading={busy} onPress={() => invite(group, member)} />
          )}
        </HStack>
      )}
      {open && (
        <VStack gap={Space.md} style={styles.mt}>
          <HStack wrap>
            {EMOJIS.map((e) => (
              <Chip key={e} label={e} selected={member.emoji === e} onPress={() => updateMember(member.id, { emoji: e })} />
            ))}
          </HStack>
          <Field label="Nombre" value={name} onChangeText={setName} />
          <Field label="Alias / CVU" autoCapitalize="none" value={alias} onChangeText={setAlias} />
          <Field label="Ingreso mensual" hint="Para dividir según ingresos." keyboardType="decimal-pad" inputMode="decimal" value={incomeText} onChangeText={setIncomeText} />
          {!member.income && <Pill tone="neutral" label="Sin ingreso cargado: “según ingresos” divide en partes iguales" />}
          <Button
            title="Guardar"
            small
            disabled={!name.trim()}
            onPress={() => {
              updateMember(member.id, { name: name.trim(), alias: alias.trim() || undefined, income: parseAmount(incomeText) ?? undefined });
              setOpen(false);
            }}
          />
        </VStack>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  mt: { marginTop: Space.md },
});
