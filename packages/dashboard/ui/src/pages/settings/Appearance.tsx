import { useState, useEffect } from 'react';
import { ThemeSelector } from '../../components/ThemeSelector';
import { useTheme, type ThemeId } from '../../contexts/ThemeContext';
import { api } from '../../api';

export function SettingsAppearance() {
  const { theme, setTheme } = useTheme();
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [serverTheme, setServerTheme] = useState<ThemeId | null>(null);

  useEffect(() => {
    api.getAppearance()
      .then(res => {
        const t = res.data.theme as ThemeId;
        setServerTheme(t);
      })
      .catch(() => {
        // If server has no saved theme, treat current theme as the baseline
        setServerTheme(theme);
      });
  }, []);

  const hasChanges = serverTheme !== null && theme !== serverTheme;

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.updateAppearance(theme);
      setServerTheme(theme);
      setSuccess('Theme updated successfully');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save theme');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <h2>Appearance</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
        Choose your theme. Changes preview instantly.
      </p>
      <ThemeSelector />
      {hasChanges && (
        <button
          className="btn-primary"
          onClick={handleSave}
          disabled={saving}
          style={{ marginTop: '1.5rem' }}
        >
          {saving ? 'Saving...' : 'Save Theme'}
        </button>
      )}
      {success && <p className="success" style={{ marginTop: '0.75rem' }}>{success}</p>}
      {error && <p className="error" style={{ marginTop: '0.75rem' }}>{error}</p>}
    </div>
  );
}
