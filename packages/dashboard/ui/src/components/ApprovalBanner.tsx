import { useState, useEffect, useCallback, useRef } from 'react';

interface PendingApproval {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
}

export function ApprovalBanner() {
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const dismissedRef = useRef<Set<string>>(new Set());

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/tool-approvals/pending');
      if (!res.ok) return;
      const data: PendingApproval[] = await res.json();
      setApprovals(data.filter(a => !dismissedRef.current.has(a.id)));
    } catch {
      // silently ignore polling errors
    }
  }, []);

  useEffect(() => {
    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [poll]);

  const resolve = useCallback(async (id: string, approved: boolean) => {
    dismissedRef.current.add(id);
    setApprovals(prev => prev.filter(a => a.id !== id));
    try {
      await fetch(`/api/v1/tool-approvals/${id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved }),
      });
    } catch {
      // best-effort
    }
  }, []);

  if (approvals.length === 0) return null;

  return (
    <div className="ab-banner">
      {approvals.map(a => (
        <div key={a.id} className="ab-item">
          <span className="ab-tool">{a.toolName}</span>
          <span className="ab-args">{JSON.stringify(a.args)}</span>
          <button className="ab-approve" onClick={() => resolve(a.id, true)}>Approve</button>
          <button className="ab-deny" onClick={() => resolve(a.id, false)}>Deny</button>
        </div>
      ))}
    </div>
  );
}
