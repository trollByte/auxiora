interface BenchmarkChartProps {
  scores: Record<string, number>;
  maxScore?: number;
}

export function BenchmarkChart({ scores, maxScore = 100 }: BenchmarkChartProps) {
  if (!scores || Object.keys(scores).length === 0) return null;

  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);

  return (
    <div className="bc-chart">
      {entries.map(([name, value]) => (
        <div key={name} className="bc-row">
          <span className="bc-label" title={name}>{name}</span>
          <div className="bc-bar-track">
            <div
              className="bc-bar-fill"
              style={{ width: `${Math.min(100, (value / maxScore) * 100)}%` }}
            />
          </div>
          <span className="bc-value">{value.toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}
