import { createDarkTheme, createLightTheme, type BrandVariants, type Theme } from '@fluentui/react-components';

/** A Fluent brand ramp around the macOS system blue (#007AFF at 80, Fluent's light-theme brand background). */
const macBlue: BrandVariants = {
  10: '#00122b', 20: '#001d45', 30: '#002960', 40: '#00357a', 50: '#004295', 60: '#004faf', 70: '#006ae6',
  80: '#007aff', 90: '#2b8cff', 100: '#4f9eff', 110: '#6eb0ff', 120: '#8cc1ff', 130: '#a9d2ff', 140: '#c6e2ff',
  150: '#e2f0ff', 160: '#f2f8ff',
};

const macFont = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif';

const macOverrides: Partial<Theme> = {
  fontFamilyBase: macFont,
  borderRadiusSmall: '4px',
  borderRadiusMedium: '6px',
  borderRadiusLarge: '10px',
};

export const macLightTheme: Theme = { ...createLightTheme(macBlue), ...macOverrides };
// macOS dark mode uses a lighter blue (#0A84FF) for controls.
export const macDarkTheme: Theme = { ...createDarkTheme(macBlue), ...macOverrides, colorBrandBackground: '#0a84ff' };
