const STATUS_COLORS: Record<string, string> = {
  active: 'badge-green',
  paused: 'badge-yellow',
  deleted: 'badge-red',
  enabled: 'badge-green',
  disabled: 'badge-gray',
};

export function StatusBadge({ status }: { status: string }) {
  const className = STATUS_COLORS[status] || 'badge-gray';
  return <span className={`badge ${className}`}>{status}</span>;
}
