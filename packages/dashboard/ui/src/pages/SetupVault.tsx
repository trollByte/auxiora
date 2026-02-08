import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { SetupProgress } from '../components/SetupProgress';
import { PasswordStrength } from '../components/PasswordStrength';

export function SetupVault() {
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
      await api.setupVault(password);
      navigate('/setup/dashboard-password');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create vault');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="setup-page">
      <SetupProgress currentStep={1} />
      <div className="setup-card">
        <h1>Create Vault Password</h1>
        <p className="subtitle">This password encrypts your secrets. Store it somewhere safe — it cannot be recovered.</p>
        <form onSubmit={handleSubmit}>
          <label>Vault password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          <PasswordStrength password={password} />
          <label>Confirm password</label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          <button type="submit" className="setup-btn-primary" disabled={loading}>
            {loading ? 'Creating...' : 'Create Vault'}
          </button>
          {error && <p className="error">{error}</p>}
        </form>
      </div>
    </div>
  );
}
