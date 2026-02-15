import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SetupProgress } from '../components/SetupProgress';
import { ThemeSelector } from '../components/ThemeSelector';
import { useTheme } from '../contexts/ThemeContext';
import { api } from '../api';

export function SetupAppearance() {
  const { theme } = useTheme();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleContinue = async () => {
    setLoading(true);
    setError('');
    try {
      await api.updateAppearance(theme);
      navigate('/setup/provider');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save appearance');
      setLoading(false);
    }
  };

  return (
    <div className="setup-page">
      <SetupProgress currentStep={5} />
      <div className="setup-card" style={{ maxWidth: 720 }}>
        <h1>Appearance</h1>
        <p className="subtitle">Choose a visual theme for Mission Control. You can change this later in settings.</p>
        <ThemeSelector />
        {error && <p className="error">{error}</p>}
        <button
          className="btn-primary"
          onClick={handleContinue}
          disabled={loading}
          style={{ marginTop: '1.5rem', width: '100%' }}
        >
          {loading ? 'Saving...' : 'Continue'}
        </button>
      </div>
    </div>
  );
}
