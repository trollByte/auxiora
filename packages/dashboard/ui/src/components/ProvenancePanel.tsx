interface ConfidenceFactor {
  signal: string;
  impact: 'positive' | 'negative';
  detail: string;
}

interface SourceAttribution {
  type: string;
  label: string;
  confidence: number;
}

export interface TransparencyMeta {
  confidence: {
    level: 'high' | 'medium' | 'low';
    score: number;
    factors: ConfidenceFactor[];
  };
  sources: SourceAttribution[];
  model: {
    provider: string;
    model: string;
    tokens: { input: number; output: number };
    cost: { input: number; output: number; total: number };
    finishReason: string;
    latencyMs: number;
  };
  personality: {
    domain: string;
    emotionalRegister: string;
    activeTraits: Array<{ name: string; weight: number }>;
    knowledgeBoundary?: { topic: string; corrections: number };
  };
  trace: {
    enrichmentStages: string[];
    toolsUsed: string[];
    processingMs: number;
  };
}

const SOURCE_ICONS: Record<string, string> = {
  tool_result: '\u{1F527}',
  memory_recall: '\u{1F9E0}',
  knowledge_graph: '\u{1F310}',
  user_data: '\u{1F464}',
  model_generation: '\u{1F916}',
};

function badgeClass(level: string): string {
  if (level === 'high') return 'pp-confidence-badge pp-badge-green';
  if (level === 'medium') return 'pp-confidence-badge pp-badge-amber';
  return 'pp-confidence-badge pp-badge-red';
}

export function ProvenancePanel({ meta, onClose }: { meta: TransparencyMeta; onClose: () => void }) {
  const kb = meta.personality.knowledgeBoundary;

  return (
    <>
      <div className="pp-overlay" onClick={onClose} />
      <div className="pp-panel">
        <div className="pp-header">
          <span className="pp-header-title">Why did I say that?</span>
          <button className="pp-close-btn" onClick={onClose} aria-label="close">
            X
          </button>
        </div>

        <div className="pp-body">
          {/* Confidence Breakdown */}
          <div className="pp-section">
            <div className="pp-section-title">Confidence Breakdown</div>
            <div className="pp-confidence-row">
              <span className={badgeClass(meta.confidence.level)}>
                {meta.confidence.score}
              </span>
              <span className="pp-confidence-level">
                {meta.confidence.level.charAt(0).toUpperCase() + meta.confidence.level.slice(1)}
              </span>
            </div>
            {meta.confidence.factors.map((f, i) => (
              <div key={i} className="pp-factor">
                <span className="pp-factor-icon">
                  {f.impact === 'positive' ? '+' : '-'}
                </span>
                <span className="pp-factor-signal">{f.signal}</span>
                <span className="pp-factor-detail">{f.detail}</span>
              </div>
            ))}
          </div>

          {/* Source Attribution */}
          <div className="pp-section">
            <div className="pp-section-title">Source Attribution</div>
            {meta.sources.map((s, i) => (
              <div key={i} className="pp-source-row">
                <span className="pp-source-icon">{SOURCE_ICONS[s.type] ?? '\u2753'}</span>
                <span className="pp-source-label">{s.label}</span>
                <div className="pp-source-bar-track">
                  <div
                    className="pp-source-bar"
                    style={{ width: `${Math.round(s.confidence * 100)}%` }}
                  />
                </div>
                <span className="pp-source-conf">{s.confidence.toFixed(2)}</span>
              </div>
            ))}
          </div>

          {/* Personality Influence */}
          <div className="pp-section">
            <div className="pp-section-title">Personality Influence</div>
            <div className="pp-detail-row">
              <span className="pp-detail-label">Domain</span>
              <span className="pp-detail-value">{meta.personality.domain.replace(/_/g, ' ')}</span>
            </div>
            <div className="pp-detail-row">
              <span className="pp-detail-label">Register</span>
              <span className="pp-detail-value">{meta.personality.emotionalRegister}</span>
            </div>
            {meta.personality.activeTraits.map((t, i) => (
              <div key={i} className="pp-trait-row">
                <span className="pp-trait-name">{t.name}</span>
                <div className="pp-trait-bar-track">
                  <div
                    className="pp-trait-bar"
                    style={{ width: `${Math.round(t.weight * 100)}%` }}
                  />
                </div>
                <span className="pp-trait-weight">{t.weight.toFixed(2)}</span>
              </div>
            ))}
            {kb && (
              <div className="pp-kb-warning">
                {'\u26A0'} Knowledge boundary: {kb.topic} (corrected {kb.corrections}x)
              </div>
            )}
          </div>

          {/* Processing Pipeline */}
          <div className="pp-section">
            <div className="pp-section-title">Processing Pipeline</div>
            <div className="pp-pipeline">
              {meta.trace.enrichmentStages.map((stage, i) => (
                <span key={i} className="pp-pipeline-node">
                  {i > 0 && <span className="pp-pipeline-arrow">{'\u2192'}</span>}
                  <span className="pp-pipeline-stage">{stage}</span>
                </span>
              ))}
            </div>
            {meta.trace.toolsUsed.length > 0 && (
              <div className="pp-detail-row">
                <span className="pp-detail-label">Tools</span>
                <span className="pp-detail-value">{meta.trace.toolsUsed.join(', ')}</span>
              </div>
            )}
            <div className="pp-detail-row">
              <span className="pp-detail-label">Model</span>
              <span className="pp-detail-value">{meta.model.provider} / {meta.model.model}</span>
            </div>
            <div className="pp-detail-row">
              <span className="pp-detail-label">Latency</span>
              <span className="pp-detail-value">{meta.model.latencyMs.toLocaleString()}ms</span>
            </div>
            <div className="pp-detail-row">
              <span className="pp-detail-label">Tokens</span>
              <span className="pp-detail-value">{meta.model.tokens.input} in / {meta.model.tokens.output} out</span>
            </div>
          </div>
        </div>

        <div className="pp-footer">
          Total processing: {meta.trace.processingMs}ms
        </div>
      </div>
    </>
  );
}
