import { Alert, Platform, Share, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';

import type { Member } from '@/domain/types';

import { T } from './text';
import { Radius, Space, useTheme } from './theme';

export function Avatar({ member, size = 36 }: { member: Pick<Member, 'emoji' | 'color'>; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: member.color + '33',
        borderColor: member.color,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <T style={{ fontSize: size * 0.5, lineHeight: size * 0.62 }}>{member.emoji}</T>
    </View>
  );
}

export function ProgressBar({ ratio, color, height = 10, track }: { ratio: number; color?: string; height?: number; track?: string }) {
  const theme = useTheme();
  return (
    <View style={{ height, borderRadius: height, backgroundColor: track ?? theme.cardAlt, overflow: 'hidden' }}>
      <View
        style={{
          width: `${Math.max(0, Math.min(1, ratio)) * 100}%`,
          height: '100%',
          borderRadius: height,
          backgroundColor: color ?? theme.primary,
        }}
      />
    </View>
  );
}

/** Barra apilada (p. ej. cuánto aportó cada miembro). */
export function StackedBar({ parts, height = 10 }: { parts: { value: number; color: string }[]; height?: number }) {
  const theme = useTheme();
  const total = parts.reduce((a, p) => a + Math.max(0, p.value), 0);
  return (
    <View style={[styles.stacked, { height, borderRadius: height, backgroundColor: theme.cardAlt }]}>
      {total > 0 &&
        parts.map((p, i) => (p.value > 0 ? <View key={i} style={{ flex: p.value / total, backgroundColor: p.color }} /> : null))}
    </View>
  );
}

export function Pill({ label, tone }: { label: string; tone: 'positive' | 'negative' | 'warning' | 'neutral' | 'primary' }) {
  const theme = useTheme();
  const map = {
    positive: [theme.positiveSoft, theme.positive],
    negative: [theme.negativeSoft, theme.negative],
    warning: [theme.warningSoft, theme.warning],
    neutral: [theme.cardAlt, theme.textSecondary],
    primary: [theme.primarySoft, theme.primary],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <T variant="caption" bold style={{ color: fg }}>
        {label}
      </T>
    </View>
  );
}

export function EmptyState({ emoji, title, body }: { emoji: string; title: string; body?: string }) {
  return (
    <View style={styles.empty}>
      <T style={styles.emptyEmoji}>{emoji}</T>
      <T variant="heading" center>
        {title}
      </T>
      {body && (
        <T tone="secondary" center>
          {body}
        </T>
      )}
    </View>
  );
}

/** Confirmación que funciona igual en iOS, Android y web. */
export function confirm(title: string, message: string, confirmLabel = 'Borrar'): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}

export function notify(title: string, message?: string) {
  if (Platform.OS === 'web') window.alert(message ? `${title}\n\n${message}` : title);
  else Alert.alert(title, message);
}

export function success() {
  if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

export async function copy(text: string, what = 'Copiado') {
  await Clipboard.setStringAsync(text);
  success();
  notify(`${what} ✅`, text);
}

/** Abre el menú de compartir del sistema; en web sin `navigator.share`, copia el texto. */
export async function shareText(message: string) {
  if (Platform.OS === 'web' && !(typeof navigator !== 'undefined' && 'share' in navigator)) {
    await copy(message, 'Mensaje copiado para pegar');
    return;
  }
  try {
    await Share.share({ message });
  } catch {
    await copy(message, 'Mensaje copiado para pegar');
  }
}

const styles = StyleSheet.create({
  stacked: { flexDirection: 'row', overflow: 'hidden' },
  pill: { paddingHorizontal: Space.sm, paddingVertical: 3, borderRadius: Radius.pill, alignSelf: 'flex-start' },
  empty: { alignItems: 'center', gap: Space.sm, paddingVertical: Space.xxl, paddingHorizontal: Space.lg },
  emptyEmoji: { fontSize: 48, lineHeight: 58 },
});
