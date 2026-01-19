/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#1f8a5b';
const tintColorDark = '#60e1a8';

export const Colors = {
  light: {
    text: '#1a1d1b',
    background: '#f7f4ef',
    tint: tintColorLight,
    icon: '#5d6b63',
    tabIconDefault: '#5d6b63',
    tabIconSelected: tintColorLight,
    surface: '#ffffff',
    surfaceAlt: '#eef3ed',
    border: '#d8e2d6',
    muted: '#6a7b72',
    accent: '#ff6b35',
    accentText: '#1a1d1b',
  },
  dark: {
    text: '#f2f4f2',
    background: '#0f1411',
    tint: tintColorDark,
    icon: '#a5b3ab',
    tabIconDefault: '#a5b3ab',
    tabIconSelected: tintColorDark,
    surface: '#171f1b',
    surfaceAlt: '#1f2a24',
    border: '#2b3a31',
    muted: '#97a69c',
    accent: '#ff9f1c',
    accentText: '#1a1d1b',
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
