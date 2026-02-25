import { useState, useEffect } from 'react';
import { api } from '../../api';

export function SettingsIdentity() {
  const [name, setName] = useState('');
  const [pronouns, setPronouns] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.getIdentity()
      .then(res => {
        setName(res.data.name);
        setPronouns(res.data.pronouns);
      })
      .catch(err => setError(err.message));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.updateIdentity(name, pronouns);
      setSuccess('Identity updated successfully');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <h2>Identity</h2>
      <form className="settings-form" onSubmit={handleSave}>
        <label>Agent Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Auxiora"
        />
        <label>Pronouns</label>
        <input
          type="text"
          value={pronouns}
          onChange={(e) => setPronouns(e.target.value)}
          placeholder="they/them"
        />
        <button className="settings-btn" type="submit" disabled={saving || !name}>
          {saving ? 'Saving...' : 'Save'}
        </button>
        {success && <div className="settings-success">{success}</div>}
        {error && <div className="error">{error}</div>}
      </form>
    </div>
  );
}
