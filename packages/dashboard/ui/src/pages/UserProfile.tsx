import { useState, useEffect } from 'react';
import { api } from '../api.js';

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function TrendArrow({ trend }: { trend: string }) {
  if (trend === 'improving') return <span className="up-trend-arrow">&#x25B2;</span>;
  if (trend === 'declining') return <span className="up-trend-decline">&#x25BC;</span>;
  return <span className="up-trend-flat">&#x25AC;</span>;
}

export function UserProfile() {
  const [model, setModel] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function fetchModel() {
    setLoading(true);
    setError(null);
    api.getUserModel()
      .then(data => { setModel(data); setLoading(false); })
      .catch(err => {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('not available') || msg.includes('404')) {
          setError('Not enough data yet. Keep chatting and check back later!');
        } else {
          setError(msg);
        }
        setLoading(false);
      });
  }

  useEffect(() => { fetchModel(); }, []);

  if (loading) {
    return <div className="up-page"><div className="up-loading">Loading user profile...</div></div>;
  }

  if (error) {
    return (
      <div className="up-page">
        <div className="up-header">
          <h2 className="up-title">What do you know about me?</h2>
        </div>
        <div className="up-empty">{error}</div>
      </div>
    );
  }

  if (!model) return null;

  const now = Date.now();

  return (
    <div className="up-page">
      <div className="up-header">
        <h2 className="up-title">What do you know about me?</h2>
        <div className="up-header-right">
          <span className="up-synthesized">Synthesized {formatDateTime(model.synthesizedAt)}</span>
          <button className="up-refresh-btn" onClick={fetchModel}>Refresh</button>
        </div>
      </div>

      {/* Narrative */}
      {model.narrative && (
        <section className="up-section">
          <p className="up-narrative">{model.narrative}</p>
        </section>
      )}

      {/* Domain Expertise */}
      {model.topDomains && model.topDomains.length > 0 && (
        <section className="up-section">
          <h3 className="up-section-title">Domain Expertise</h3>
          <div className="up-domain-grid">
            {model.topDomains.map((d: any) => (
              <div key={d.domain} className="up-domain-card">
                <div className="up-domain-name">{d.domain}</div>
                <div className="up-domain-bar-track">
                  <div
                    className="up-domain-bar-fill"
                    style={{ width: `${Math.round(d.share * 100)}%` }}
                  />
                </div>
                <div className="up-domain-stats">
                  <span className="up-domain-share">{Math.round(d.share * 100)}%</span>
                  {d.satisfactionRate !== null && (
                    <span className="up-domain-satisfaction">
                      {Math.round(d.satisfactionRate * 100)}% satisfied
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Communication Style */}
      {model.communicationStyle && (
        <section className="up-section">
          <h3 className="up-section-title">Communication Style</h3>
          <div className="up-comm-labels">
            <span className="up-comm-badge">{model.communicationStyle.verbosityLabel}</span>
            <span className="up-comm-badge">{model.communicationStyle.toneLabel}</span>
          </div>
          <div className="up-comm-bars">
            {[
              { label: 'Verbosity', value: model.communicationStyle.verbosityPreference },
              { label: 'Warmth', value: model.communicationStyle.warmthPreference },
              { label: 'Humor', value: model.communicationStyle.humorPreference },
            ].map(item => (
              <div key={item.label} className="up-comm-row">
                <span className="up-comm-label">{item.label}</span>
                <div className="up-comm-track">
                  <div
                    className="up-comm-fill"
                    style={{ width: `${Math.round(Math.min(1, Math.max(0, item.value)) * 100)}%` }}
                  />
                </div>
                <span className="up-comm-value">{item.value.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Satisfaction */}
      {model.satisfaction && (
        <section className="up-section">
          <h3 className="up-section-title">Satisfaction</h3>
          <div className="up-satisfaction-header">
            <TrendArrow trend={model.satisfaction.overallTrend} />
            <span className="up-satisfaction-trend">{model.satisfaction.overallTrend}</span>
            <span className="up-satisfaction-count">{model.satisfaction.totalFeedback} feedback items</span>
          </div>
          {model.satisfaction.strongDomains.length > 0 && (
            <div className="up-satisfaction-group">
              <span className="up-satisfaction-label">Strong:</span>
              {model.satisfaction.strongDomains.map((d: string) => (
                <span key={d} className="up-tag up-tag-strong">{d}</span>
              ))}
            </div>
          )}
          {model.satisfaction.weakDomains.length > 0 && (
            <div className="up-satisfaction-group">
              <span className="up-satisfaction-label">Needs work:</span>
              {model.satisfaction.weakDomains.map((d: string) => (
                <span key={d} className="up-tag up-tag-weak">{d}</span>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Active Decisions */}
      {model.activeDecisions && model.activeDecisions.length > 0 && (
        <section className="up-section">
          <h3 className="up-section-title">Active Decisions</h3>
          <div className="up-decision-list">
            {model.activeDecisions.map((d: any) => (
              <div key={d.id} className="up-decision-card">
                <div className="up-decision-summary">{d.summary}</div>
                <div className="up-decision-meta">
                  <span className="up-decision-date">{formatDate(d.createdAt)}</span>
                  {d.tags.map((t: string) => (
                    <span key={t} className="up-tag">{t}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Due Follow-ups */}
      {model.dueFollowUps && model.dueFollowUps.length > 0 && (
        <section className="up-section">
          <h3 className="up-section-title">Due Follow-ups</h3>
          <div className="up-decision-list">
            {model.dueFollowUps.map((d: any) => {
              const overdue = d.followUpDate && d.followUpDate < now;
              return (
                <div key={d.id} className={`up-decision-card ${overdue ? 'up-overdue' : ''}`}>
                  <div className="up-decision-summary">
                    {overdue && <span className="up-overdue-badge">Overdue</span>}
                    {d.summary}
                  </div>
                  <div className="up-decision-meta">
                    {d.followUpDate && (
                      <span className="up-decision-date">Due {formatDate(d.followUpDate)}</span>
                    )}
                    {d.tags.map((t: string) => (
                      <span key={t} className="up-tag">{t}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Correction Patterns */}
      {model.correctionSummary && model.correctionSummary.totalCorrections > 0 && (
        <section className="up-section">
          <h3 className="up-section-title">Correction Patterns</h3>
          <div className="up-corrections-total">
            {model.correctionSummary.totalCorrections} total corrections
          </div>
          {model.correctionSummary.topPatterns.length > 0 && (
            <div className="up-corrections-list">
              {model.correctionSummary.topPatterns.map((p: any, i: number) => (
                <div key={i} className="up-correction-row">
                  <span className="up-correction-from">{p.from}</span>
                  <span className="up-correction-arrow">&rarr;</span>
                  <span className="up-correction-to">{p.to}</span>
                  <span className="up-correction-count">{p.count}x</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Stats Footer */}
      <footer className="up-footer">
        <div className="up-stat">
          <span className="up-stat-label">Interactions</span>
          <span className="up-stat-value">{model.totalInteractions}</span>
        </div>
        <div className="up-stat">
          <span className="up-stat-label">First used</span>
          <span className="up-stat-value">{formatDate(model.firstUsed)}</span>
        </div>
        <div className="up-stat">
          <span className="up-stat-label">Last used</span>
          <span className="up-stat-value">{formatDate(model.lastUsed)}</span>
        </div>
      </footer>
    </div>
  );
}
