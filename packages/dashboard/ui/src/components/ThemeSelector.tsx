import { THEMES, useTheme, type ThemeId } from '../contexts/ThemeContext';

interface ThemeSelectorProps {
  selected?: ThemeId;
  onSelect?: (id: ThemeId) => void;
}

export function ThemeSelector({ selected, onSelect }: ThemeSelectorProps) {
  const { theme: currentTheme, setTheme } = useTheme();
  const activeTheme = selected ?? currentTheme;

  const handleSelect = (id: ThemeId) => {
    setTheme(id);
    onSelect?.(id);
  };

  return (
    <div className="theme-grid">
      {THEMES.map((t) => (
        <div
          key={t.id}
          className={`theme-card${activeTheme === t.id ? ' selected' : ''}`}
          onClick={() => handleSelect(t.id)}
        >
          <div className="theme-swatches">
            {t.colors.map((c, i) => (
              <div key={i} className="theme-swatch" style={{ background: c }} />
            ))}
          </div>
          <div className="theme-info">
            <h3>{t.name}</h3>
            <span className={`theme-mode-badge ${t.mode}`}>{t.mode}</span>
          </div>
          <p className="theme-description">{t.description}</p>
        </div>
      ))}
    </div>
  );
}
