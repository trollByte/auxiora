import { useState } from 'react';
import { api } from '../../api';
import { PasswordStrength } from '../../components/PasswordStrength';

export function SettingsSecurity() {
  // Dashboard password state
  const [dashOld, setDashOld] = useState('');
  const [dashNew, setDashNew] = useState('');
  const [dashConfirm, setDashConfirm] = useState('');
  const [dashSaving, setDashSaving] = useState(false);
  const [dashSuccess, setDashSuccess] = useState('');
  const [dashError, setDashError] = useState('');

  // Vault password state
  const [vaultNew, setVaultNew] = useState('');
  const [vaultConfirm, setVaultConfirm] = useState('');
  const [vaultSaving, setVaultSaving] = useState(false);
  const [vaultSuccess, setVaultSuccess] = useState('');
  const [vaultError, setVaultError] = useState('');

  const handleDashboardPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setDashError('');
    setDashSuccess('');
    if (dashNew !== dashConfirm) {
      setDashError('New passwords do not match');
      return;
    }
    if (dashNew.length < 8) {
      setDashError('Password must be at least 8 characters');
      return;
    }
    setDashSaving(true);
    try {
      await api.changeDashboardPassword(dashOld, dashNew);
      setDashSuccess('Mission Control password changed');
      setDashOld('');
      setDashNew('');
      setDashConfirm('');
    } catch (err: any) {
      setDashError(err.message);
    } finally {
      setDashSaving(false);
    }
  };

  const handleVaultPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setVaultError('');
    setVaultSuccess('');
    if (vaultNew !== vaultConfirm) {
      setVaultError('New passwords do not match');
      return;
    }
    if (vaultNew.length < 8) {
      setVaultError('Password must be at least 8 characters');
      return;
    }
    setVaultSaving(true);
    try {
      await api.changeVaultPassword(vaultNew);
      setVaultSuccess('Vault password changed');
      setVaultNew('');
      setVaultConfirm('');
    } catch (err: any) {
      setVaultError(err.message);
    } finally {
      setVaultSaving(false);
    }
  };

  return (
    <div className="page">
      <h2>Security</h2>

      <div className="settings-section">
        <h3>Change Mission Control Password</h3>
        <form className="settings-form" onSubmit={handleDashboardPassword}>
          <label>Current Password</label>
          <input type="password" value={dashOld} onChange={(e) => setDashOld(e.target.value)} />
          <label>New Password</label>
          <input type="password" value={dashNew} onChange={(e) => setDashNew(e.target.value)} />
          <PasswordStrength password={dashNew} />
          <label>Confirm New Password</label>
          <input type="password" value={dashConfirm} onChange={(e) => setDashConfirm(e.target.value)} />
          <button className="settings-btn" type="submit" disabled={dashSaving || !dashOld || !dashNew}>
            {dashSaving ? 'Saving...' : 'Change Password'}
          </button>
          {dashSuccess && <div className="settings-success">{dashSuccess}</div>}
          {dashError && <div className="error">{dashError}</div>}
        </form>
      </div>

      <div className="settings-section">
        <h3>Change Vault Password</h3>
        <form className="settings-form" onSubmit={handleVaultPassword}>
          <label>New Vault Password</label>
          <input type="password" value={vaultNew} onChange={(e) => setVaultNew(e.target.value)} />
          <PasswordStrength password={vaultNew} />
          <label>Confirm New Password</label>
          <input type="password" value={vaultConfirm} onChange={(e) => setVaultConfirm(e.target.value)} />
          <button className="settings-btn" type="submit" disabled={vaultSaving || !vaultNew}>
            {vaultSaving ? 'Saving...' : 'Change Vault Password'}
          </button>
          {vaultSuccess && <div className="settings-success">{vaultSuccess}</div>}
          {vaultError && <div className="error">{vaultError}</div>}
        </form>
      </div>
    </div>
  );
}
