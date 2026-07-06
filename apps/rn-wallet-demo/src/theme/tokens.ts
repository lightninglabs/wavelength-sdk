// The demo's design tokens, ported verbatim from the web demo's index.css so
// both apps read as the same product. Raw hex/rgba values; the soft variants
// are precomputed because RN has no color-mix.

export type ThemeName = 'light' | 'dark';

export type Palette = {
  bg: string;
  surface: string;
  surfaceAlt: string;
  // The recessed input surface: darker than bg and surfaceAlt so an inset
  // field reads as sunken on any band.
  well: string;
  border: string;
  borderStrong: string;
  text: string;
  muted: string;
  faint: string;
  accent: string;
  accentSoft: string;
  good: string;
  goodSoft: string;
  warn: string;
  warnSoft: string;
  bad: string;
  badSoft: string;
};

export const palettes: Record<ThemeName, Palette> = {
  light: {
    bg: '#f6f6f7',
    surface: '#ffffff',
    surfaceAlt: '#f0f0f2',
    well: '#e7e7eb',
    border: 'rgba(0, 0, 0, 0.1)',
    borderStrong: 'rgba(0, 0, 0, 0.16)',
    text: '#19191c',
    muted: '#5d5d67',
    faint: '#9a9aa4',
    accent: '#5b6cff',
    accentSoft: 'rgba(91, 108, 255, 0.12)',
    good: '#15935f',
    goodSoft: 'rgba(21, 147, 95, 0.15)',
    warn: '#b7791f',
    warnSoft: 'rgba(183, 121, 31, 0.1)',
    bad: '#d14343',
    badSoft: 'rgba(209, 67, 67, 0.1)',
  },
  dark: {
    bg: '#0a0a0b',
    surface: '#111113',
    surfaceAlt: '#161619',
    well: '#050506',
    border: 'rgba(255, 255, 255, 0.08)',
    borderStrong: 'rgba(255, 255, 255, 0.16)',
    text: '#ededef',
    muted: '#8a8a93',
    faint: '#5a5a63',
    accent: '#5b6cff',
    accentSoft: 'rgba(91, 108, 255, 0.14)',
    good: '#46c08a',
    goodSoft: 'rgba(70, 192, 138, 0.15)',
    warn: '#e0b54d',
    warnSoft: 'rgba(224, 181, 77, 0.1)',
    bad: '#e0686b',
    badSoft: 'rgba(224, 104, 107, 0.1)',
  },
};

// Custom fonts on RN select a family per weight (fontWeight does not reliably
// pick weights of a loaded custom font on Android), so the roles are explicit.
export const fonts = {
  sans: 'IBMPlexSans_400Regular',
  sansMedium: 'IBMPlexSans_500Medium',
  sansSemiBold: 'IBMPlexSans_600SemiBold',
  sansBold: 'IBMPlexSans_700Bold',
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
} as const;
