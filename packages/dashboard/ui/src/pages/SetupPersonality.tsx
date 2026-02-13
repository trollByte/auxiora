import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useApi } from '../hooks/useApi';
import { SetupProgress } from '../components/SetupProgress';

const VIBE_KEYWORDS: Record<string, string[]> = {
  chill: ['chill', 'relaxed', 'laid-back', 'easygoing', 'calm'],
  professional: ['professional', 'formal', 'precise', 'corporate', 'business'],
  friendly: ['friendly', 'warm', 'kind', 'caring', 'supportive', 'best friend'],
  creative: ['creative', 'imaginative', 'artistic', 'playful', 'quirky'],
  mentor: ['mentor', 'teacher', 'guide', 'coach', 'wise'],
  technical: ['technical', 'code', 'developer', 'engineer', 'hacker'],
};

function matchVibeToTemplate(vibe: string): string | null {
  const lower = vibe.toLowerCase();
  for (const [templateId, keywords] of Object.entries(VIBE_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return templateId;
  }
  return null;
}

export function SetupPersonality() {
  const { data: templates, loading: templatesLoading, error: templatesError } = useApi(() => api.getSetupTemplates(), []);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const recommendedId = useMemo(() => {
    const vibe = localStorage.getItem('auxiora_setup_vibe');
    if (!vibe) return null;
    localStorage.removeItem('auxiora_setup_vibe');
    return matchVibeToTemplate(vibe);
  }, []);

  const handleSelect = async (templateId: string) => {
    setSelected(templateId);
    setLoading(true);
    setError('');
    try {
      await api.setupPersonality(templateId);
      navigate('/setup/appearance');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to set personality');
      setLoading(false);
    }
  };

  return (
    <div className="setup-page">
      <SetupProgress currentStep={4} />
      <div className="setup-card" style={{ maxWidth: 680 }}>
        <h1>Personality</h1>
        <p className="subtitle">Choose a personality template for your assistant.</p>
        {templatesLoading && <p style={{ color: 'var(--text-secondary)' }}>Loading templates...</p>}
        {templatesError && <p className="error">{templatesError}</p>}
        {templates && (
          <div className="template-grid">
            {templates.data.map((t) => (
              <div
                key={t.id}
                className={`template-card${selected === t.id ? ' selected' : ''}${recommendedId === t.id ? ' recommended' : ''}`}
                onClick={() => !loading && handleSelect(t.id)}
              >
                <h3>{t.name}{recommendedId === t.id && <span className="badge badge-primary" style={{ marginLeft: '0.5rem', fontSize: '0.6rem' }}>Recommended</span>}</h3>
                <p>{t.description}</p>
                {t.preview && <p style={{ marginTop: '0.5rem', fontStyle: 'italic', fontSize: '0.75rem' }}>{t.preview}</p>}
              </div>
            ))}
          </div>
        )}
        {error && <p className="error">{error}</p>}
        {loading && <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>Saving...</p>}
      </div>
    </div>
  );
}
