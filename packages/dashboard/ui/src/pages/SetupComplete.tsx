import { useState, useEffect } from 'react';
import { api } from '../api';

export function SetupComplete() {
  const [error, setError] = useState('');

  useEffect(() => {
    api.completeSetup().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Failed to finalize setup');
    });
  }, []);

  return (
    <div className="setup-page">
      <div className="setup-card" style={{ textAlign: 'center' }}>
        <div className="setup-complete-check">{'\u2713'}</div>
        <h1>Setup Complete!</h1>
        <p className="subtitle">Your assistant is ready to go.</p>
        {error && <p className="error">{error}</p>}
        <div className="setup-complete-buttons">
          <button className="setup-btn-primary" onClick={() => { window.location.href = '/'; }}>
            Open Chat
          </button>
          <button className="setup-btn-secondary" onClick={() => { window.location.href = '/dashboard'; }}>
            Go to Mission Control
          </button>
        </div>
      </div>
    </div>
  );
}
