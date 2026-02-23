interface TokenCostBadgeProps {
  tokens: { input: number; output: number };
  cost: { input: number; output: number; total: number };
  latencyMs: number;
}

export function TokenCostBadge({ tokens, cost, latencyMs }: TokenCostBadgeProps) {
  const total = tokens.input + tokens.output;
  if (total === 0) return null;

  return (
    <div className="token-cost-badge">
      <span
        className="badge-item badge-tokens"
        title={`${tokens.input.toLocaleString()} in / ${tokens.output.toLocaleString()} out`}
      >
        {total.toLocaleString()} tok
      </span>
      <span
        className="badge-item badge-cost"
        title={`$${cost.input.toFixed(4)} in / $${cost.output.toFixed(4)} out`}
      >
        ${cost.total.toFixed(3)}
      </span>
      <span className="badge-item badge-latency">
        {latencyMs.toLocaleString()}ms
      </span>
    </div>
  );
}
