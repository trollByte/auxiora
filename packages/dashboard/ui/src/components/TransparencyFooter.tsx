import { useState } from 'react';

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

interface TransparencyMeta {
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

export function TransparencyFooter({ meta }: { meta: TransparencyMeta | undefined }) {
  const [expanded, setExpanded] = useState(false);

  if (!meta) return null;

  const totalTokens = meta.model.tokens.input + meta.model.tokens.output;
  const dot = meta.confidence.level === 'high' ? '\u{1F7E2}' : meta.confidence.level === 'medium' ? '\u{1F7E1}' : '\u{1F534}';
  const kb = meta.personality.knowledgeBoundary;

  return (
    <div className={`transparency-footer confidence-${meta.confidence.level}`} style={{ marginTop: 4, fontSize: '0.75rem', opacity: 0.7 }}>
      <button
        className="transparency-toggle"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 'inherit', padding: '2px 0', textAlign: 'left', width: '100%', display: 'flex', justifyContent: 'space-between' }}
      >
        <span className="transparency-summary">
          {dot}{' '}
          <span>{meta.confidence.level.charAt(0).toUpperCase() + meta.confidence.level.slice(1)}</span>
          {' '}({meta.confidence.score})
          {kb && <span className="kb-warning" style={{ color: '#e74c3c' }}> {'\u26A0'} Topic previously corrected ({kb.corrections}x)</span>}
          {' \u00B7 '}{meta.model.model}
          {' \u00B7 '}{totalTokens} tokens
          {' \u00B7 '}${meta.model.cost.total.toFixed(3)}
          {meta.personality.domain !== 'general' && <>{' \u00B7 '}{meta.personality.domain.replace(/_/g, ' ')}</>}
        </span>
        <span>{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>

      {expanded && (
        <div className="transparency-details" style={{ fontFamily: 'monospace', fontSize: '0.7rem', marginTop: 4, padding: '8px', borderRadius: 4, background: 'var(--bg-secondary, rgba(0,0,0,0.05))' }}>
          <div style={{ marginBottom: 8 }}>
            <strong>Confidence</strong>
            <div>Score: {meta.confidence.score} ({meta.confidence.level.charAt(0).toUpperCase() + meta.confidence.level.slice(1)})</div>
            {meta.confidence.factors.map((f, i) => (
              <div key={i}>{f.impact === 'positive' ? '  + ' : '  - '}{f.signal}: {f.detail}</div>
            ))}
          </div>

          <div style={{ marginBottom: 8 }}>
            <strong>Sources</strong>
            {meta.sources.map((s, i) => (
              <div key={i}>{SOURCE_ICONS[s.type] ?? '\u2753'} {s.label} ({s.confidence.toFixed(2)})</div>
            ))}
          </div>

          <div>
            <strong>Processing</strong>
            <div>Model: {meta.model.provider} / {meta.model.model}</div>
            <div>Tokens: {meta.model.tokens.input} in / {meta.model.tokens.output} out</div>
            <div>Cost: ${meta.model.cost.input.toFixed(4)} in / ${meta.model.cost.output.toFixed(4)} out = ${meta.model.cost.total.toFixed(4)} total</div>
            <div>Latency: {meta.model.latencyMs.toLocaleString()}ms</div>
            <div>Finish: {meta.model.finishReason}</div>
            {meta.trace.enrichmentStages.length > 0 && (
              <div>Stages: {meta.trace.enrichmentStages.join(' \u2192 ')}</div>
            )}
            {meta.trace.toolsUsed.length > 0 && (
              <div>Tools: {meta.trace.toolsUsed.join(', ')}</div>
            )}
            <div>Domain: {meta.personality.domain}</div>
            <div>Register: {meta.personality.emotionalRegister}</div>
            {meta.personality.activeTraits.length > 0 && (
              <div>Traits: {meta.personality.activeTraits.map(t => `${t.name} (${t.weight.toFixed(2)})`).join(', ')}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
