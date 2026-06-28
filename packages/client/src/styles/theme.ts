import type { GlobalThemeOverrides } from 'naive-ui'

// Naive UI overrides re-themed to match the design token system.
//
// ponytail: Naive UI's `seemly/rgba` parses every color at mount time and
// rejects `var(...)` strings, so we have to inline literal hex/rgba values
// here. Each theme below mirrors the values declared in `theme.css` so the
// generated CSS still cascades through plain DOM elements via CSS variables.
//
// To update: edit the literals below AND `theme.css` together.

const LIGHT = {
  textPrimary: '#111827',
  textSecondary: '#6b7280',
  textTertiary: '#8b8f97',
  body: '#fafafa',
  sider: '#e6e6e6',
  card: '#ffffff',
  input: '#ffffff',
  border: 'rgba(15, 23, 42, 0.12)',
  borderActive: 'rgba(0, 0, 0, 0.5)',
  borderInput: 'rgba(0, 0, 0, 0.5)',
  hover: 'rgba(17, 24, 39, 0.04)',
  hoverStrong: 'rgba(17, 24, 39, 0.08)',
  accent: '#000000',
  accentHover: '#1a1a1a',
  accentText: '#ffffff',
  success: '#22c55e',
  error: '#ef4444',
}

const DARK = {
  textPrimary: '#fafafa',
  textSecondary: '#b4b4b4',
  textTertiary: '#808080',
  body: '#121212',
  sider: '#121212',
  card: '#191a1a',
  input: '#191a1a',
  border: 'rgba(255, 255, 255, 0.1)',
  borderActive: 'rgba(255, 255, 255, 0.3)',
  borderInput: 'rgba(255, 255, 255, 0.3)',
  hover: 'rgba(255, 255, 255, 0.05)',
  hoverStrong: 'rgba(255, 255, 255, 0.1)',
  accent: '#ffffff',
  accentHover: '#eaeaea',
  accentText: '#121212',
  success: '#3fb950',
  error: '#f85149',
}

const TYPOGRAPHY = {
  borderRadius: '8px',
  borderRadiusSmall: '6px',
  fontSize: '14px',
  fontSizeMedium: '14px',
  heightMedium: '36px',
  fontFamily: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
  fontFamilyMono: '"JetBrains Mono", "Fira Code", Consolas, monospace',
}

function buildOverrides(p: typeof LIGHT): GlobalThemeOverrides {
  return {
    common: {
      primaryColor: p.accent,
      primaryColorHover: p.accentHover,
      primaryColorPressed: p.accentHover,
      primaryColorSuppl: p.accent,
      bodyColor: p.body,
      cardColor: p.card,
      modalColor: p.card,
      popoverColor: p.card,
      tableColor: p.card,
      inputColor: p.input,
      actionColor: p.body,
      textColorBase: p.textPrimary,
      textColor1: p.textPrimary,
      textColor2: p.textSecondary,
      textColor3: p.textTertiary,
      dividerColor: p.border,
      borderColor: p.border,
      hoverColor: p.hover,
      ...TYPOGRAPHY,
    },
    Layout: {
      color: p.body,
      siderColor: p.sider,
      headerColor: p.body,
    },
    Menu: {
      itemTextColorActive: p.textPrimary,
      itemTextColorActiveHover: p.textPrimary,
      itemTextColorChildActive: p.textPrimary,
      itemIconColorActive: p.textPrimary,
      itemIconColorActiveHover: p.textPrimary,
      itemColorActive: p.hover,
      itemColorActiveHover: p.hoverStrong,
      arrowColorActive: p.textPrimary,
    },
    Button: {
      textColorPrimary: p.accentText,
      colorPrimary: p.accent,
      colorHoverPrimary: p.accentHover,
      colorPressedPrimary: p.accentHover,
    },
    Input: {
      color: p.input,
      colorFocus: p.input,
      border: `1px solid ${p.border}`,
      borderHover: `1px solid ${p.borderInput}`,
      borderFocus: `1px solid ${p.borderInput}`,
      borderDisabled: `1px solid ${p.hover}`,
      groupLabelBorder: `1px solid ${p.border}`,
      placeholderColor: p.textTertiary,
      caretColor: p.textPrimary,
    },
    InternalSelection: {
      border: `1px solid ${p.border}`,
      borderHover: `1px solid ${p.borderInput}`,
      borderActive: `1px solid ${p.borderInput}`,
      borderFocus: `1px solid ${p.borderInput}`,
    },
    Card: {
      color: p.card,
      borderColor: p.border,
    },
    Modal: {
      color: p.card,
    },
    Tag: {
      borderRadius: '6px',
    },
    Switch: {
      railColor: p.border,
      railColorActive: p.success,
      loadingColor: p.textPrimary,
      opacityDisabled: 0.4,
    },
  }
}

export const lightThemeOverrides = buildOverrides(LIGHT)
export const darkThemeOverrides = buildOverrides(DARK)

export function getThemeOverrides(isDark: boolean, _isComic?: boolean): GlobalThemeOverrides {
  return isDark ? darkThemeOverrides : lightThemeOverrides
}