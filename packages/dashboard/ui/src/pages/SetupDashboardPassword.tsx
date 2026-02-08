import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { SetupProgress } from '../components/SetupProgress';
import { PasswordStrength } from '../components/PasswordStrength';

export function SetupDashboardPassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true);
    setError('');
    try {
      await api.setupDashboardPassword(password);
      navigate('/setup/identity');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to set password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="setup-page">
      <SetupProgress currentStep={2} />
      <div className="setup-card">
        <h1>Dashboard Password</h1>
        <p className="subtitle">This password protects your dashboard. You'll use it to log in.</p>
        <form onSubmit={handleSubmit}>
          <label>Dashboard password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          <PasswordStrength password={password} />
          <label>Confirm password</label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          <button type="submit" className="setup-btn-primary" disabled={loading}>
            {loading ? 'Saving...' : 'Set Password'}
          </button>
          {error && <p className="error">{error}</p>}
        </form>
      </div>
    </div>
  );
}
