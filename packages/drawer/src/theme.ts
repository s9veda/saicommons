export interface DrawerTheme {
  /** Primary brand color - used for buttons, accents, active states */
  primary: string;
  /** Lighter version of primary for backgrounds, hover states */
  primaryLight: string;
  /** Border color for cards, inputs, dividers */
  border: string;
  /** Muted text color for secondary content */
  muted: string;
  /** Main text color */
  text: string;
  /** Error/danger color for destructive actions */
  danger: string;
  /** Lighter version of danger for backgrounds */
  dangerLight: string;
  /** Success/ok color */
  ok: string;
  /** Main background color */
  bg: string;
  /** Surface/card background color */
  surface: string;
  /** Accent color for highlights */
  accent: string;
  /** White color */
  white: string;
}

/** Default theme matching the current saicommons design */
export const defaultTheme: DrawerTheme = {
  primary: '#21483B',
  primaryLight: '#DCE7DB',
  border: '#E6E1D7',
  muted: '#738078',
  text: '#18251F',
  danger: '#A64237',
  dangerLight: '#F1E3D1',
  ok: '#21483B',
  bg: '#F7F4EC',
  surface: '#FFFEFA',
  accent: '#C17A38',
  white: '#FFFFFF',
};

/** Deep merge user theme with defaults */
export function createTheme(userTheme: Partial<DrawerTheme>): DrawerTheme {
  return { ...defaultTheme, ...userTheme };
}