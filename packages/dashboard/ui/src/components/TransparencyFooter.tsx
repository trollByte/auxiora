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
    <div className={`transparency-footer confidence-${meta.confidence.level}`}>
      <button
        className="transparency-toggle"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span className="transparency-summary">
          {dot}{' '}
          <span>{meta.confidence.level.charAt(0).toUpperCase() + meta.confidence.level.slice(1)}</span>
          {' '}({meta.confidence.score})
          {kb && <span className="kb-warning"> {'\u26A0'} Topic previously corrected ({kb.corrections}x)</span>}
          {' \u00B7 '}{meta.model.model}
          {' \u00B7 '}{totalTokens} tokens
          {' \u00B7 '}${meta.model.cost.total.toFixed(3)}
          {meta.personality.domain !== 'general' && <>{' \u00B7 '}{meta.personality.domain.replace(/_/g, ' ')}</>}
        </span>
        <span className="tf-expand-icon">{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>

      {expanded && (
        <div className="transparency-details">
          <div className="tf-section">
            <strong className="tf-section-title">Confidence</strong>
            <div>Score: {meta.confidence.score} ({meta.confidence.level.charAt(0).toUpperCase() + meta.confidence.level.slice(1)})</div>
            {meta.confidence.factors.map((f, i) => (
              <div key={i} className={f.impact === 'positive' ? 'tf-factor-positive' : 'tf-factor-negative'}>{f.impact === 'positive' ? '  + ' : '  - '}{f.signal}: {f.detail}</div>
            ))}
          </div>

          <div className="tf-section">
            <strong className="tf-section-title">Sources</strong>
            {meta.sources.map((s, i) => (
              <div key={i} className="tf-source-line">{SOURCE_ICONS[s.type] ?? '\u2753'} {s.label} ({s.confidence.toFixed(2)})</div>
            ))}
          </div>

          <div className="tf-section tf-section-last">
            <strong className="tf-section-title">Processing</strong>
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
