import type { Theme } from './types';
import { larkThemes } from './lark';
import { classicThemes } from './classic';
import { modernThemes } from './modern';
import { extraThemes } from './extra';

export type { Theme };
export const THEMES: Theme[] = [...larkThemes, ...classicThemes, ...modernThemes, ...extraThemes];

export interface ThemeGroup {
  label: string;
  themes: Theme[];
}

export const THEME_GROUPS: ThemeGroup[] = [
  { label: 'Lark 专属', themes: larkThemes },
  { label: '经典', themes: classicThemes },
  { label: '潮流', themes: modernThemes },
  { label: '更多风格', themes: extraThemes },
];


/** Extract the accent hex color from a theme's link color style */
export function getThemeAccentHex(themeId: string): string | undefined {
  const theme = THEMES.find(t => t.id === themeId);
  if (!theme) return undefined;
  // The 'a' (link) style reliably contains the primary accent color for each theme
  const aStyle = theme.styles.a ?? '';
  const match = aStyle.match(/#[0-9a-fA-F]{3,8}/);
  return match ? match[0] : undefined;
}
