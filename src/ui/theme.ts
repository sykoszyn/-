import '@/global.css';

import { Platform, useColorScheme } from 'react-native';

export const Colors = {
  light: {
    background: '#F5F4FA',
    card: '#FFFFFF',
    cardAlt: '#EFEDF8',
    border: '#E4E1F0',
    text: '#16142B',
    textSecondary: '#6B6880',
    primary: '#5B4CF0',
    primarySoft: '#ECEAFE',
    onPrimary: '#FFFFFF',
    positive: '#13965F',
    positiveSoft: '#E1F5EA',
    negative: '#E0484D',
    negativeSoft: '#FDECEC',
    warning: '#B97500',
    warningSoft: '#FFF2D6',
    hero: '#1E1A4D',
    onHero: '#FFFFFF',
    onHeroSecondary: '#C9C4F5',
  },
  dark: {
    background: '#0E0D16',
    card: '#1A1926',
    cardAlt: '#24223A',
    border: '#2C2A40',
    text: '#F4F3FA',
    textSecondary: '#A19EB8',
    primary: '#7468F7',
    primarySoft: '#2A2550',
    onPrimary: '#FFFFFF',
    positive: '#3DD68C',
    positiveSoft: '#123326',
    negative: '#FF6B6B',
    negativeSoft: '#3A1A1D',
    warning: '#F5B83D',
    warningSoft: '#3A2E12',
    hero: '#2A2470',
    onHero: '#FFFFFF',
    onHeroSecondary: '#C9C4F5',
  },
} as const;

export type Palette = { [K in keyof typeof Colors.light]: string };

export function useTheme(): Palette {
  return Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
}

export const Space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const Radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;
export const MaxWidth = 640;

export const Fonts = Platform.select({
  web: { sans: 'var(--font-display)', rounded: 'var(--font-display)' },
  ios: { sans: 'system-ui', rounded: 'ui-rounded' },
  default: { sans: 'normal', rounded: 'normal' },
});
