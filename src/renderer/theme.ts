import type { ThemeVars } from "../common/types";

/** Lens CSS variables that the viewer uses; they are copied to the pop-out window. */
const THEME_VARIABLES = [
  "--mainBackground",
  "--logsBackground",
  "--layoutBackground",
  "--layoutTabsBackground",
  "--inputControlBackground",
  "--textColorPrimary",
  "--textColorSecondary",
  "--textColorAccent",
  "--borderColor",
  "--blue",
  "--colorError",
  "--colorSuccess",
  "--colorWarning",
  "--font-main",
];

export function readThemeVars(): ThemeVars {
  const styles = getComputedStyle(document.documentElement);
  const theme: ThemeVars = {};

  for (const name of THEME_VARIABLES) {
    const value = styles.getPropertyValue(name).trim();

    if (value) {
      theme[name] = value;
    }
  }

  return theme;
}
