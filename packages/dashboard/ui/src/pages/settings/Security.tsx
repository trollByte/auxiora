import { useState, useEffect } from 'react';
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

  // Seal (auto-unseal) state
  const [sealStatus, setSealStatus] = useState<{ sealed: boolean; pinRequired: boolean } | null>(null);
  const [sealPassword, setSealPassword] = useState('');
  const [sealPin, setSealPin] = useState('');
  const [sealSaving, setSealSaving] = useState(false);
  const [sealSuccess, setSealSuccess] = useState('');
  const [sealError, setSealError] = useState('');

  useEffect(() => {
    api.getSealStatus().then(setSealStatus).catch(() => setSealStatus({ sealed: false, pinRequired: false }));
  }, []);

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

  const handleEnableSeal = async (e: React.FormEvent) => {
    e.preventDefault();
    setSealError('');
    setSealSuccess('');
    if (!sealPassword) {
      setSealError('Vault password is required');
      return;
    }
    if (sealPin && sealPin.length < 4) {
      setSealError('PIN must be at least 4 characters');
      return;
    }
    setSealSaving(true);
    try {
      await api.enableSeal(sealPassword, sealPin || undefined);
      setSealSuccess('Auto-unseal enabled');
      setSealPassword('');
      setSealPin('');
      setSealStatus({ sealed: true, pinRequired: sealPin.length > 0 });
    } catch (err: any) {
      setSealError(err.message);
    } finally {
      setSealSaving(false);
    }
  };

  const handleDisableSeal = async () => {
    setSealError('');
    setSealSuccess('');
    setSealSaving(true);
    try {
      await api.disableSeal();
      setSealSuccess('Auto-unseal disabled');
      setSealStatus({ sealed: false, pinRequired: false });
    } catch (err: any) {
      setSealError(err.message);
    } finally {
      setSealSaving(false);
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

      <div className="settings-section">
        <h3>Auto-Unseal</h3>
        <p className="settings-info">
          When enabled, the vault automatically unlocks on restart using this machine's identity.
          No plaintext password is stored on disk. Optionally add a PIN for extra security.
        </p>
        {sealStatus === null ? (
          <p>Loading...</p>
        ) : sealStatus.sealed ? (
          <div>
            <p>Status: <strong>Enabled</strong>{sealStatus.pinRequired ? ' (PIN required)' : ' (no PIN)'}</p>
            <button className="settings-btn" onClick={handleDisableSeal} disabled={sealSaving}>
              {sealSaving ? 'Disabling...' : 'Disable Auto-Unseal'}
            </button>
          </div>
        ) : (
          <form className="settings-form" onSubmit={handleEnableSeal}>
            <label>Vault Password</label>
            <input type="password" value={sealPassword} onChange={(e) => setSealPassword(e.target.value)} placeholder="Enter vault password to verify" />
            <label>PIN (optional, 4+ characters)</label>
            <input type="password" value={sealPin} onChange={(e) => setSealPin(e.target.value)} placeholder="Leave empty for machine-only binding" />
            <button className="settings-btn" type="submit" disabled={sealSaving || !sealPassword}>
              {sealSaving ? 'Enabling...' : 'Enable Auto-Unseal'}
            </button>
          </form>
        )}
        {sealSuccess && <div className="settings-success">{sealSuccess}</div>}
        {sealError && <div className="error">{sealError}</div>}
      </div>
    </div>
  );
}
