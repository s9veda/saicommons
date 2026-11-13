import React, { createContext, useContext, ReactNode } from 'react';
import type { DrawerTheme } from './theme';

interface DrawerThemeContextValue {
  theme: DrawerTheme;
}

const DrawerThemeContext = createContext<DrawerThemeContextValue | null>(null);

export function DrawerThemeProvider({ theme, children }: { theme: DrawerTheme; children: ReactNode }) {
  return (
    <DrawerThemeContext.Provider value={{ theme }}>
      {children}
    </DrawerThemeContext.Provider>
  );
}

export function useDrawerTheme(): DrawerTheme {
  const context = useContext(DrawerThemeContext);
  if (!context) {
    // Fallback to default theme if not wrapped in provider
    return require('./theme').defaultTheme;
  }
  return context.theme;
}