import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { SetupProgress } from '../components/SetupProgress';

export function SetupIdentity() {
  const [name, setName] = useState('');
  const [pronouns, setPronouns] = useState('she/her');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.setupIdentity(name || 'Aria', pronouns);
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
        <p className="subtitle">Give your AI assistant a name and pronouns.</p>
        <form onSubmit={handleSubmit}>
          <label>Agent name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Aria" autoFocus />
          <label>Pronouns</label>
          <select value={pronouns} onChange={(e) => setPronouns(e.target.value)}>
            <option value="she/her">she/her</option>
            <option value="he/him">he/him</option>
            <option value="they/them">they/them</option>
            <option value="it/its">it/its</option>
          </select>
          <button type="submit" className="setup-btn-primary" disabled={loading}>
            {loading ? 'Saving...' : 'Continue'}
          </button>
          {error && <p className="error">{error}</p>}
        </form>
      </div>
    </div>
  );
}
