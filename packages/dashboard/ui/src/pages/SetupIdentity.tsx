import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { SetupProgress } from '../components/SetupProgress';

const AI_NAMES = [
  'Nova', 'Atlas', 'Jasper', 'Echo', 'Sage', 'Onyx', 'Iris', 'Phoenix',
  'Kai', 'Luna', 'Orion', 'Zephyr', 'Rune', 'Pixel', 'Nyx', 'Sol',
  'Cleo', 'Juno', 'Vex', 'Aura',
];

export function SetupIdentity() {
  const randomName = useMemo(() => AI_NAMES[Math.floor(Math.random() * AI_NAMES.length)], []);
  const [name, setName] = useState('');
  const [pronouns, setPronouns] = useState('she/her');
  const [vibe, setVibe] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Pre-fill with existing agent name if already configured
  useEffect(() => {
    api.getSetupStatus().then(status => {
      if (status.agentName && status.agentName !== 'Auxiora') {
        setName(status.agentName);
      }
    }).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.setupIdentity(name || randomName, pronouns, vibe || undefined);
      if (vibe) localStorage.setItem('auxiora_setup_vibe', vibe);
      navigate('/setup/personality');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save identity');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="setup-page">
      <SetupProgress currentStep={3} />
      <div className="setup-card">
        <h1>Agent Identity</h1>
        <p className="subtitle">Give your AI assistant a name, pronouns, and vibe.</p>
        <form onSubmit={handleSubmit}>
          <label>Agent name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={randomName} autoFocus />
          <label>Pronouns</label>
          <select value={pronouns} onChange={(e) => setPronouns(e.target.value)}>
            <option value="she/her">she/her</option>
            <option value="he/him">he/him</option>
            <option value="they/them">they/them</option>
            <option value="it/its">it/its</option>
          </select>
          <label>Describe the vibe</label>
          <textarea
            value={vibe}
            onChange={(e) => setVibe(e.target.value)}
            placeholder="e.g. chill and witty, professional and sharp, warm like a best friend"
            rows={3}
            style={{ width: '100%', resize: 'vertical' }}
          />
          <button type="submit" className="setup-btn-primary" disabled={loading}>
            {loading ? 'Saving...' : 'Continue'}
          </button>
          {error && <p className="error">{error}</p>}
        </form>
      </div>
    </div>
  );
}
