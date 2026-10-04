import { StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, type Palette, useTheme } from './theme';

type Variant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption';
type Tone = 'default' | 'secondary' | 'primary' | 'positive' | 'negative' | 'warning' | 'onHero' | 'onHeroSecondary' | 'onPrimary';

const TONES: Record<Tone, keyof Palette> = {
  default: 'text',
  secondary: 'textSecondary',
  primary: 'primary',
  positive: 'positive',
  negative: 'negative',
  warning: 'warning',
  onHero: 'onHero',
  onHeroSecondary: 'onHeroSecondary',
  onPrimary: 'onPrimary',
};

export type TProps = TextProps & { variant?: Variant; tone?: Tone; bold?: boolean; center?: boolean };

export function T({ variant = 'body', tone = 'default', bold, center, style, ...rest }: TProps) {
  const theme = useTheme();
  return (
    <Text
      style={[
        styles.base,
        styles[variant],
        { color: theme[TONES[tone]] },
        bold && styles.bold,
        center && styles.center,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  base: { fontFamily: Fonts.sans },
  display: { fontSize: 38, lineHeight: 44, fontWeight: '800', letterSpacing: -1, fontVariant: ['tabular-nums'] },
  title: { fontSize: 26, lineHeight: 32, fontWeight: '800', letterSpacing: -0.5 },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '500' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 12.5, lineHeight: 17, fontWeight: '500' },
  bold: { fontWeight: '700' },
  center: { textAlign: 'center' },
});
