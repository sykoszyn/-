import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';

import { T } from './text';
import { Fonts, Radius, Space, useTheme } from './theme';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'onHero';

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  small,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: string;
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
  style?: ViewStyle;
}) {
  const theme = useTheme();
  const palette: Record<ButtonVariant, { bg: string; fg: string }> = {
    primary: { bg: theme.primary, fg: theme.onPrimary },
    secondary: { bg: theme.primarySoft, fg: theme.primary },
    ghost: { bg: 'transparent', fg: theme.primary },
    danger: { bg: theme.negativeSoft, fg: theme.negative },
    onHero: { bg: 'rgba(255,255,255,0.16)', fg: theme.onHero },
  };
  const { bg, fg } = palette[variant];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: bg },
        (pressed || disabled) && { opacity: disabled ? 0.45 : 0.75 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <T variant={small ? 'label' : 'body'} bold style={{ color: fg }}>
          {icon ? `${icon}  ` : ''}
          {title}
        </T>
      )}
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? theme.primary : theme.card,
          borderColor: selected ? theme.primary : theme.border,
        },
        pressed && { opacity: 0.75 },
      ]}>
      <T variant="label" style={{ color: selected ? theme.onPrimary : theme.text }}>
        {icon ? `${icon} ` : ''}
        {label}
      </T>
    </Pressable>
  );
}

export function ChipGroup<V extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: V; label: string; icon?: string }[];
  value: V | undefined;
  onChange: (v: V) => void;
}) {
  return (
    <View style={styles.chips}>
      {options.map((o) => (
        <Chip key={String(o.value)} label={o.label} icon={o.icon} selected={o.value === value} onPress={() => onChange(o.value)} />
      ))}
    </View>
  );
}

export function Label({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <View style={styles.label}>
      <T variant="label" tone="secondary">
        {children}
      </T>
      {hint && (
        <T variant="caption" tone="secondary">
          {hint}
        </T>
      )}
    </View>
  );
}

export function Field({ label, hint, style, ...props }: TextInputProps & { label?: string; hint?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      {label && <Label hint={hint}>{label}</Label>}
      <TextInput
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }, style]}
        {...props}
      />
    </View>
  );
}

/** Input grande para montos, con el símbolo de la moneda adelante. */
export function AmountInput({
  value,
  onChangeText,
  symbol,
  autoFocus,
}: {
  value: string;
  onChangeText: (v: string) => void;
  symbol: string;
  autoFocus?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.amountBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <T variant="title" tone="secondary">
        {symbol}
      </T>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="0"
        placeholderTextColor={theme.textSecondary}
        keyboardType="decimal-pad"
        inputMode="decimal"
        autoFocus={autoFocus}
        accessibilityLabel="Monto"
        style={[styles.amountInput, { color: theme.text }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: Radius.md,
    paddingHorizontal: Space.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSmall: { minHeight: 38, paddingHorizontal: Space.lg, borderRadius: Radius.sm },
  chip: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  label: { gap: 2 },
  field: { gap: Space.sm },
  input: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    minHeight: 50,
  },
  amountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingHorizontal: Space.xl,
    paddingVertical: Space.md,
  },
  amountInput: {
    flex: 1,
    minWidth: 0,
    fontFamily: Fonts.sans,
    fontSize: 40,
    fontWeight: '800',
    paddingVertical: Space.xs,
  },
});
