import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { SetupProgress } from '../components/SetupProgress.js';

interface Question {
  id: string;
  label: string;
  trait: string;
  options: Array<{ label: string; value: number }>;
}

const QUESTIONS: Question[] = [
  {
    id: 'verbosity',
    label: 'Preferred response style',
    trait: 'verbosity',
    options: [
      { label: 'Concise', value: -0.2 },
      { label: 'Balanced', value: 0 },
      { label: 'Detailed', value: 0.2 },
    ],
  },
  {
    id: 'warmth',
    label: 'Communication tone',
    trait: 'warmth',
    options: [
      { label: 'Analytical', value: -0.15 },
      { label: 'Balanced', value: 0 },
      { label: 'Warm', value: 0.2 },
    ],
  },
  {
    id: 'humor',
    label: 'Humor level',
    trait: 'humor',
    options: [
      { label: 'Serious', value: -0.15 },
      { label: 'Occasional', value: 0 },
      { label: 'Frequent', value: 0.2 },
    ],
  },
  {
    id: 'formality',
    label: 'Formality',
    trait: 'formality',
    options: [
      { label: 'Casual', value: -0.2 },
      { label: 'Balanced', value: 0 },
      { label: 'Formal', value: 0.2 },
    ],
  },
  {
    id: 'depth',
    label: 'Explanation depth',
    trait: 'secondOrder',
    options: [
      { label: 'Surface level', value: -0.1 },
      { label: 'Standard', value: 0 },
      { label: 'Deep analysis', value: 0.15 },
    ],
  },
];

export function SetupPreferences() {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSelect = (questionId: string, value: number) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      const nonZeroAnswers = QUESTIONS.filter(q => answers[q.id] && answers[q.id] !== 0);
      for (const q of nonZeroAnswers) {
        await api.updateArchitectPreference(q.trait, answers[q.id]);
      }
      navigate('/setup/personality');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save preferences');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="setup-page">
      <SetupProgress currentStep={4} />
      <div className="setup-card">
        <h1>Your Preferences</h1>
        <p className="subtitle">Help your assistant understand how you like to communicate. You can always change these later.</p>

        <div className="preferences-questions">
          {QUESTIONS.map(q => (
            <div key={q.id} className="preferences-question">
              <label>{q.label}</label>
              <div className="preferences-options">
                {q.options.map(opt => (
                  <button
                    key={opt.label}
                    className={`preferences-option ${answers[q.id] === opt.value ? 'active' : ''}`}
                    onClick={() => handleSelect(q.id, opt.value)}
                    type="button"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {error && <p className="error">{error}</p>}

        <div className="preferences-actions">
          <button className="setup-btn-secondary" onClick={() => navigate('/setup/personality')}>
            Skip
          </button>
          <button className="setup-btn-primary" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Saving...' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
