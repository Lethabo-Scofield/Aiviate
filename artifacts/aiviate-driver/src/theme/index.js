// Central design tokens. Import { COLORS, SPACING, RADII, TYPE, FONTS } from '../theme'.
//
// Palette philosophy (iOS Human Interface):
//   • Brand teal is reserved for INTERACTIVE accents — primary CTAs, the
//     active tab tint, links, the unread dot, and the brand badge.
//   • Surfaces and decoration use a neutral gray scale modeled on iOS
//     systemBackground / systemGroupedBackground / systemFill so the brand
//     color stands out where it actually matters.

export const COLORS = {
  // Brand (used sparingly — only for interactive intent)
  teal: '#008080',
  tealDark: '#006666',
  tint: '#008080', // semantic alias used by tappable text/icons

  // Brand "ink" — kept for occasional dark accents (map banner, modal headers)
  navy: '#0F2A3D',

  // iOS-grade neutrals
  bg: '#F2F2F7',          // systemGroupedBackground
  surface: '#FFFFFF',     // grouped card / sheet
  surfaceAlt: '#F9F9FB',  // hover/pressed background

  // Text
  text: '#1C1C1E',        // label
  textDim: '#6E6E73',     // secondaryLabel
  textTertiary: '#A1A1A6',// tertiaryLabel

  // Hairlines & fills
  border: 'rgba(60,60,67,0.12)',          // separator
  borderStrong: 'rgba(60,60,67,0.22)',
  fill: 'rgba(120,120,128,0.12)',          // systemFill (icon backgrounds)
  fillSecondary: 'rgba(120,120,128,0.08)', // secondarySystemFill (chips)
  fillTertiary: 'rgba(120,120,128,0.05)',  // tertiarySystemFill (rows hover)

  // Semantic
  warning: '#FF9F0A',
  danger: '#FF3B30',
  success: '#34C759',
  star: '#FFB300',
};

export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 };

export const RADII = { sm: 8, md: 12, lg: 14, xl: 16, pill: 999 };

// Font family names — match the keys passed to useFonts() in App.js.
export const FONTS = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
};

export const TYPE = {
  h1: { fontFamily: FONTS.extrabold, fontSize: 22, letterSpacing: -0.3, color: COLORS.text },
  h2: { fontFamily: FONTS.bold, fontSize: 18, color: COLORS.text },
  body: { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.text },
  caption: { fontFamily: FONTS.regular, fontSize: 11, color: COLORS.textDim },
  eyebrow: {
    fontFamily: FONTS.semibold,
    fontSize: 13,
    color: COLORS.textDim,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
};
