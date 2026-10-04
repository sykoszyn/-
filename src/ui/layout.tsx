import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { T } from './text';
import { MaxWidth, Radius, Space, useTheme } from './theme';

/** Contenedor scrolleable de cada pantalla, centrado y con ancho máximo en web/tablets. */
export function Screen({
  children,
  title,
  subtitle,
  right,
  safeTop = true,
  footer,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  safeTop?: boolean;
  footer?: ReactNode;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <ScrollView
        style={styles.flex}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          { paddingTop: (safeTop ? insets.top : 0) + Space.lg, paddingBottom: Space.xxl + (footer ? 72 : 0) },
        ]}>
        <View style={styles.inner}>
          {(title || right) && (
            <View style={styles.header}>
              <View style={styles.flex}>
                {title && <T variant="title">{title}</T>}
                {subtitle && <T tone="secondary">{subtitle}</T>}
              </View>
              {right}
            </View>
          )}
          {children}
        </View>
      </ScrollView>
      {footer && (
        <View
          style={[
            styles.footer,
            { backgroundColor: theme.background, borderTopColor: theme.border, paddingBottom: insets.bottom + Space.md },
          ]}>
          <View style={styles.inner}>{footer}</View>
        </View>
      )}
    </View>
  );
}

export function Card({
  children,
  style,
  onPress,
  tone = 'card',
  ...rest
}: ViewProps & { onPress?: () => void; tone?: 'card' | 'alt' | 'hero' | 'primarySoft' }) {
  const theme = useTheme();
  const bg = { card: theme.card, alt: theme.cardAlt, hero: theme.hero, primarySoft: theme.primarySoft }[tone];
  const body = (
    <View style={[styles.card, { backgroundColor: bg, borderColor: tone === 'card' ? theme.border : 'transparent' }, style]} {...rest}>
      {children}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      {body}
    </Pressable>
  );
}

export function Section({
  title,
  action,
  href,
  children,
}: {
  title: string;
  action?: string;
  href?: Href;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <T variant="heading">{title}</T>
        {action && href && (
          <Pressable accessibilityRole="link" hitSlop={8} onPress={() => router.navigate(href)}>
            <T variant="label" tone="primary">
              {action}
            </T>
          </Pressable>
        )}
      </View>
      {children}
    </View>
  );
}

/** Fila de lista: ícono a la izquierda, título/subtítulo y un valor a la derecha. */
export function Row({
  icon,
  iconBg,
  title,
  subtitle,
  right,
  rightSub,
  rightTone,
  onPress,
  last,
}: {
  icon: ReactNode;
  iconBg?: string;
  title: string;
  subtitle?: string;
  right?: string;
  rightSub?: string;
  rightTone?: 'default' | 'positive' | 'negative' | 'secondary';
  onPress?: () => void;
  last?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, !last && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth }, pressed && styles.pressed]}>
      <View style={[styles.rowIcon, { backgroundColor: iconBg ?? theme.cardAlt }]}>
        {typeof icon === 'string' ? <T style={styles.rowEmoji}>{icon}</T> : icon}
      </View>
      <View style={styles.flex}>
        <T variant="body" numberOfLines={1} bold>
          {title}
        </T>
        {subtitle && (
          <T variant="caption" tone="secondary" numberOfLines={1}>
            {subtitle}
          </T>
        )}
      </View>
      {(right || rightSub) && (
        <View style={styles.rowRight}>
          {right && (
            <T variant="body" bold tone={rightTone} style={styles.tabular}>
              {right}
            </T>
          )}
          {rightSub && (
            <T variant="caption" tone="secondary">
              {rightSub}
            </T>
          )}
        </View>
      )}
    </Pressable>
  );
}

export function HStack({ children, gap = Space.sm, style, wrap }: { children: ReactNode; gap?: number; style?: ViewStyle; wrap?: boolean }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap, flexWrap: wrap ? 'wrap' : 'nowrap' }, style]}>{children}</View>;
}

export function VStack({ children, gap = Space.sm, style }: { children: ReactNode; gap?: number; style?: ViewStyle }) {
  return <View style={[{ gap }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: Space.lg, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MaxWidth, gap: Space.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: Space.md, marginBottom: Space.xs },
  card: { borderRadius: Radius.lg, padding: Space.lg, borderWidth: StyleSheet.hairlineWidth },
  pressed: { opacity: 0.7 },
  section: { gap: Space.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.md, paddingVertical: Space.md },
  rowIcon: { width: 42, height: 42, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  rowEmoji: { fontSize: 20, lineHeight: 26 },
  rowRight: { alignItems: 'flex-end' },
  tabular: { fontVariant: ['tabular-nums'] },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: Space.md,
    paddingHorizontal: Space.lg,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
