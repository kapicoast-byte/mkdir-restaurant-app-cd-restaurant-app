// Design system tokens — single source of truth
// Used by ThemeContext and any component that needs raw values (e.g. canvas drawing)

export const COLORS = {
  // Primary (orange)
  primary:       '#F97316',
  primaryDark:   '#EA580C',
  primaryLight:  '#FED7AA',
  primaryFaint:  '#FFF7ED',

  // Semantic
  success:  '#22C55E',
  warning:  '#EAB308',
  error:    '#EF4444',

  // Light theme surfaces
  bgLight:       '#FAFAFA',
  surfaceLight:  '#FFFFFF',
  borderLight:   '#E5E5E5',
  textLight:     '#111111',
  textSubLight:  '#6B7280',

  // Dark theme surfaces
  bgDark:       '#0F0F0F',
  surfaceDark:  '#1A1A1A',
  borderDark:   '#2A2A2A',
  textDark:     '#F5F5F5',
  textSubDark:  '#9CA3AF',
};

export const TYPOGRAPHY = {
  fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
  weightRegular: 400,
  weightMedium:  500,
  weightSemibold: 600,
  weightBold:    700,
};

export const RADII = {
  card:   '12px',
  button: '8px',
  input:  '8px',
  pill:   '999px',
  modal:  '16px',
};

export const SHADOWS = {
  light: '0 1px 3px rgba(0,0,0,0.08)',
  dark:  '0 1px 3px rgba(0,0,0,0.4)',
  md:    '0 4px 12px rgba(0,0,0,0.10)',
  lg:    '0 8px 24px rgba(0,0,0,0.14)',
};

export const SPACING = {
  // 4px base unit — use multiples of 4
  xs:  '4px',
  sm:  '8px',
  md:  '12px',
  lg:  '16px',
  xl:  '20px',
  '2xl': '24px',
  '3xl': '32px',
  '4xl': '40px',
  '5xl': '48px',
};
