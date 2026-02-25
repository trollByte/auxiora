import { useNavigate } from 'react-router-dom';

export function SetupWelcome() {
  const navigate = useNavigate();

  return (
    <div className="setup-page">
      <div className="setup-card" style={{ textAlign: 'center' }}>
        <h1>Welcome to Auxiora</h1>
        <p className="subtitle">
          Your personal AI assistant. Let's get you set up — it only takes a minute.
        </p>
        <button className="setup-btn-primary" onClick={() => navigate('/setup/vault')}>
          Get Started
        </button>
      </div>
    </div>
  );
}
