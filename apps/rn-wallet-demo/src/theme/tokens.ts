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
  // `accent` is the text/link/icon violet and tracks the mode for contrast.
  // `accentFill` is the button fill and stays the deep docs violet in both
  // modes, paired with white `onAccent` text (about 8:1 contrast).
  accent: string;
  accentSoft: string;
  accentFill: string;
  onAccent: string;
  // Each brand accent carries two values. The `fill*` entries are the bright
  // brand hues, for shapes that carry no text: cluster squares, eyebrow
  // squares, title underlines, and meter bars. The plain entries are for text
  // and icons, darkened in light mode so every one clears WCAG AA (4.5:1)
  // against `well`, the darkest surface accent text lands on, and so on every
  // lighter band above it. The bright hues sit at 2.7-3.7:1 on white, which is
  // why they are fills only. The `*Soft` tints back colored text, so they derive from the
  // fill hue and are precomputed because RN has no color-mix.
  fillViolet: string;
  fillTeal: string;
  fillLime: string;
  fillOrange: string;
  fillSky: string;
  violet: string;
  violetSoft: string;
  teal: string;
  tealSoft: string;
  lime: string;
  orange: string;
  sky: string;
  skySoft: string;
  good: string;
  goodSoft: string;
  warn: string;
  warnSoft: string;
  bad: string;
  badSoft: string;
};

export const palettes: Record<ThemeName, Palette> = {
  light: {
    bg: '#ffffff',
    surface: '#f7f7f8',
    surfaceAlt: '#f0f0f3',
    well: '#e9e9ec',
    border: '#e6e6e9',
    borderStrong: '#d4d4d8',
    text: '#0a0a0b',
    muted: '#52525b',
    faint: '#8b8d94',
    accent: '#5a1fd6',
    accentSoft: 'rgba(90, 31, 214, 0.1)',
    accentFill: '#5a1fd6',
    onAccent: '#ffffff',
    fillViolet: '#5a1fd6',
    fillTeal: '#0cb09a',
    fillLime: '#c9f000',
    fillOrange: '#d4720a',
    fillSky: '#2a8fb8',
    violet: '#5a1fd6',
    violetSoft: 'rgba(90, 31, 214, 0.1)',
    teal: '#087768',
    tealSoft: 'rgba(12, 176, 154, 0.1)',
    lime: '#5a7000',
    orange: '#a15608',
    sky: '#217192',
    skySoft: 'rgba(42, 143, 184, 0.1)',
    good: '#0f8a5f',
    goodSoft: 'rgba(15, 138, 95, 0.15)',
    warn: '#b7791f',
    warnSoft: 'rgba(183, 121, 31, 0.1)',
    bad: '#d14343',
    badSoft: 'rgba(209, 67, 67, 0.1)',
  },
  dark: {
    bg: '#141417',
    surface: '#1c1c21',
    surfaceAlt: '#24242a',
    well: '#0e0e10',
    border: '#303037',
    borderStrong: '#44444d',
    text: '#f5f5f7',
    muted: '#b6b6c0',
    faint: '#8c8c96',
    accent: '#a78bfa',
    accentSoft: 'rgba(167, 139, 250, 0.14)',
    accentFill: '#5a1fd6',
    onAccent: '#ffffff',
    // Dark needs no text/fill split: every bright hue already clears AA on
    // the dark ground, so both roles resolve to the same value.
    fillViolet: '#a78bfa',
    fillTeal: '#15e0c2',
    fillLime: '#c9f000',
    fillOrange: '#ffa733',
    fillSky: '#56c7f2',
    violet: '#a78bfa',
    violetSoft: 'rgba(167, 139, 250, 0.12)',
    teal: '#15e0c2',
    tealSoft: 'rgba(21, 224, 194, 0.12)',
    lime: '#c9f000',
    orange: '#ffa733',
    sky: '#56c7f2',
    skySoft: 'rgba(86, 199, 242, 0.12)',
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
  sans: 'Inter_400Regular',
  sansMedium: 'Inter_500Medium',
  sansSemiBold: 'Inter_600SemiBold',
  sansBold: 'Inter_700Bold',
  display: 'WorkSans_600SemiBold',
  displayBold: 'WorkSans_700Bold',
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
} as const;
