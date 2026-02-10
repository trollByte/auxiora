import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

export function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [agentName, setAgentName] = useState('Auxiora');
  const navigate = useNavigate();

  // Check if vault needs unlocking before allowing login
  useEffect(() => {
    api.getSetupStatus()
      .then(status => {
        if (status.agentName) setAgentName(status.agentName);
        if (status.needsSetup) {
          navigate('/setup', { replace: true });
        } else if (!status.vaultUnlocked) {
          navigate('/unlock', { replace: true });
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.login(password);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  if (checking) return null;

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>{agentName} Dashboard</h1>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Dashboard password"
            autoFocus
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
          {error && <p className="error">{error}</p>}
        </form>
      </div>
    </div>
  );
}
