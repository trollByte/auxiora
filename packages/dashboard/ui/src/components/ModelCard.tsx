import { BenchmarkChart } from './BenchmarkChart.js';

export interface DiscoveredModel {
  id: string;
  providerSource: string;
  modelId: string;
  displayName: string;
  contextLength: number;
  supportsVision: boolean;
  supportsTools: boolean;
  supportsStreaming: boolean;
  supportsImageGen: boolean;
  costPer1kInput: number;
  costPer1kOutput: number;
  strengths: string[];
  hfDownloads?: number | null;
  hfLikes?: number | null;
  hfTrendingScore?: number | null;
  hfTags?: string[] | null;
  hfBenchmarkScores?: Record<string, number> | null;
  hfInferenceProviders?: string[] | null;
  lastRefreshedAt: number;
  createdAt: number;
  enabled: boolean;
}

interface ModelCardProps {
  model: DiscoveredModel;
  onToggleEnabled: (id: string, enabled: boolean) => void;
}

function formatContextLength(len: number): string {
  if (len >= 1_000_000) return `${(len / 1_000_000).toFixed(1)}M`;
  if (len >= 1_000) return `${Math.round(len / 1_000)}K`;
  return String(len);
}

function formatCost(cost: number): string {
  if (cost === 0) return 'Free';
  if (cost < 0.001) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(3)}`;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function ModelCard({ model, onToggleEnabled }: ModelCardProps) {
  const name = model.displayName || model.modelId;
  const isOpenRouter = model.providerSource === 'openrouter';
  const isHuggingFace = model.providerSource === 'huggingface';

  return (
    <div className={`mc-card ${model.enabled ? '' : 'mc-card-disabled'}`}>
      <div className="mc-header">
        <span className="mc-name" title={model.modelId}>{name}</span>
        <span className={`mc-provider ${isOpenRouter ? 'mc-provider-openrouter' : ''} ${isHuggingFace ? 'mc-provider-hf' : ''}`}>
          {model.providerSource}
        </span>
      </div>

      <div className="mc-context">
        <span className="mc-context-label">Context</span>
        <span className="mc-context-value">{formatContextLength(model.contextLength)}</span>
      </div>

      <div className="mc-capabilities">
        {model.supportsVision && <span className="mc-badge mc-badge-blue">Vision</span>}
        {model.supportsTools && <span className="mc-badge mc-badge-green">Tools</span>}
        {model.supportsStreaming && <span className="mc-badge mc-badge-gray">Streaming</span>}
        {model.supportsImageGen && <span className="mc-badge mc-badge-purple">ImageGen</span>}
      </div>

      {(model.costPer1kInput > 0 || model.costPer1kOutput > 0) && (
        <div className="mc-cost">
          <span className="mc-cost-item">In: {formatCost(model.costPer1kInput)}/1K</span>
          <span className="mc-cost-item">Out: {formatCost(model.costPer1kOutput)}/1K</span>
        </div>
      )}

      {model.strengths && model.strengths.length > 0 && (
        <div className="mc-strengths">
          {model.strengths.map(s => (
            <span key={s} className="mc-strength-pill">{s}</span>
          ))}
        </div>
      )}

      {isHuggingFace && (
        <div className="mc-hf-stats">
          {model.hfDownloads != null && (
            <span className="mc-hf-stat" title="Downloads">{'\u2193'} {formatNumber(model.hfDownloads)}</span>
          )}
          {model.hfLikes != null && (
            <span className="mc-hf-stat" title="Likes">{'\u2665'} {formatNumber(model.hfLikes)}</span>
          )}
          {model.hfTrendingScore != null && (
            <span className="mc-hf-stat" title="Trending Score">{'\u2191'} {model.hfTrendingScore.toFixed(1)}</span>
          )}
        </div>
      )}

      {model.hfBenchmarkScores && Object.keys(model.hfBenchmarkScores).length > 0 && (
        <BenchmarkChart scores={model.hfBenchmarkScores} />
      )}

      <div className="mc-footer">
        <span className="mc-refreshed" title={new Date(model.lastRefreshedAt).toLocaleString()}>
          {timeAgo(model.lastRefreshedAt)}
        </span>
        <button
          className={`mc-toggle ${model.enabled ? 'mc-toggle-on' : 'mc-toggle-off'}`}
          onClick={() => onToggleEnabled(model.id, !model.enabled)}
          title={model.enabled ? 'Disable model' : 'Enable model'}
        >
          {model.enabled ? 'Enabled' : 'Disabled'}
        </button>
      </div>
    </div>
  );
}
