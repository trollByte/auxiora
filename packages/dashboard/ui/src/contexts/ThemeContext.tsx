import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

export const THEME_IDS = ['nebula', 'monolith', 'signal', 'polar', 'neon', 'terra'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  description: string;
  mode: 'dark' | 'light';
  colors: [string, string, string, string];
}

export const THEMES: ThemeMeta[] = [
  { id: 'nebula', name: 'Nebula', description: 'Glassmorphism command center', mode: 'dark', colors: ['#080b16', '#8b5cf6', '#10b981', '#f0f0f5'] },
  { id: 'monolith', name: 'Monolith', description: 'Cinematic ultra-minimal', mode: 'dark', colors: ['#000000', '#7c3aed', '#ffffff', '#404040'] },
  { id: 'signal', name: 'Signal', description: 'Warm sci-fi terminal', mode: 'dark', colors: ['#0c0c0c', '#f59e0b', '#22c55e', '#e8e4dd'] },
  { id: 'polar', name: 'Polar', description: 'Premium light mode', mode: 'light', colors: ['#ffffff', '#3b82f6', '#059669', '#111827'] },
  { id: 'neon', name: 'Neon', description: 'Cyberpunk vivid', mode: 'dark', colors: ['#09090b', '#06b6d4', '#ec4899', '#22c55e'] },
  { id: 'terra', name: 'Terra', description: 'Warm organic dark', mode: 'dark', colors: ['#1a1612', '#c97b5c', '#8faa7b', '#e8e0d4'] },
];

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (id: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'nebula',
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    const stored = localStorage.getItem('auxiora-theme') as ThemeId | null;
    return stored && THEME_IDS.includes(stored) ? stored : 'nebula';
  });

  const setTheme = useCallback((id: ThemeId) => {
    setThemeState(id);
    localStorage.setItem('auxiora-theme', id);
    document.documentElement.setAttribute('data-theme', id);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
