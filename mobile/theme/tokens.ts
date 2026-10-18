/** Shared Noriss design tokens, aligned with the Django workspace brand. */
export const palette = {
  background: '#F4F6FB',
  text: '#111827',
  primary: '#315CDD',
  accent: '#7751D8',
  muted: '#687493',
  surface: '#ffffff',
  border: '#E1E6F0',
  navy: '#10182D',
  primaryDark: '#10182D',
  primarySoft: '#EDF1FF',
  accentSoft: '#F1EDFF',
  success: '#157a55',
  warning: '#8a5a08',
  danger: '#b42318',
} as const;

/** Spacing follows an 8-point rhythm; xs is reserved for fine adjustments. */
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 40 } as const;
export const radius = { sm: 10, md: 14, lg: 18, xl: 22, pill: 999 } as const;
export const elevation = {
  card: {
    shadowColor: palette.navy,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 2,
  },
} as const;
