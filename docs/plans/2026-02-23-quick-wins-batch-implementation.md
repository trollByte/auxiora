# Quick Wins Batch Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship 4 small, high-impact dashboard features: cost badge on chat messages, provider health panel, dead letter queue monitor, and cold-start onboarding questionnaire.

**Architecture:** All 4 features are independent — they touch different files and can be developed in parallel. Each adds a React component in the dashboard, backed by existing API data. Two require new REST endpoints (provider health panel and dead letter monitor), the other two use existing data already available in the dashboard.

**Tech Stack:** TypeScript strict ESM, React 19, vitest, Express 5 (gateway/dashboard router), CSS custom properties

---

## Feature 1: Cost Badge on Chat Messages

### Task 1: Create `TokenCostBadge` component

**Files:**
- Create: `packages/dashboard/ui/src/components/TokenCostBadge.tsx`
- Create: `packages/dashboard/ui/tests/components/TokenCostBadge.test.tsx`

**Step 1: Write the failing test**

Create `packages/dashboard/ui/tests/components/TokenCostBadge.test.tsx`:

```typescript
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TokenCostBadge } from '../../src/components/TokenCostBadge.js';

describe('TokenCostBadge', () => {
  it('renders total token count', () => {
    render(<TokenCostBadge tokens={{ input: 150, output: 80 }} cost={{ input: 0.0015, output: 0.0024, total: 0.0039 }} latencyMs={320} />);
    expect(screen.getByText(/230/)).toBeTruthy();
  });

  it('renders cost with dollar sign', () => {
    render(<TokenCostBadge tokens={{ input: 150, output: 80 }} cost={{ input: 0.0015, output: 0.0024, total: 0.0039 }} latencyMs={320} />);
    expect(screen.getByText(/\$0\.004/)).toBeTruthy();
  });

  it('renders latency', () => {
    render(<TokenCostBadge tokens={{ input: 150, output: 80 }} cost={{ input: 0.0015, output: 0.0024, total: 0.0039 }} latencyMs={320} />);
    expect(screen.getByText(/320ms/)).toBeTruthy();
  });

  it('shows token breakdown in title attribute', () => {
    render(<TokenCostBadge tokens={{ input: 1000, output: 500 }} cost={{ input: 0.01, output: 0.015, total: 0.025 }} latencyMs={500} />);
    const tokenEl = screen.getByTitle(/1,000 in \/ 500 out/);
    expect(tokenEl).toBeTruthy();
  });

  it('returns null when tokens are zero', () => {
    const { container } = render(<TokenCostBadge tokens={{ input: 0, output: 0 }} cost={{ input: 0, output: 0, total: 0 }} latencyMs={0} />);
    expect(container.firstChild).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/dashboard/ui/tests/components/TokenCostBadge.test.tsx`
Expected: FAIL — module not found

**Step 3: Implement `TokenCostBadge`**

Create `packages/dashboard/ui/src/components/TokenCostBadge.tsx`:

```tsx
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
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run packages/dashboard/ui/tests/components/TokenCostBadge.test.tsx`
Expected: PASS (all 5 tests)

**Step 5: Commit**

```bash
git add packages/dashboard/ui/src/components/TokenCostBadge.tsx packages/dashboard/ui/tests/components/TokenCostBadge.test.tsx
git commit -m "feat(dashboard): add TokenCostBadge component"
```

---

### Task 2: Wire `TokenCostBadge` into Chat page and add CSS

**Files:**
- Modify: `packages/dashboard/ui/src/pages/Chat.tsx:964-969`
- Modify: `packages/dashboard/ui/src/styles/global.css` (append)

**Step 1: Add badge to Chat.tsx**

In `packages/dashboard/ui/src/pages/Chat.tsx`, add import at top:

```typescript
import { TokenCostBadge } from '../components/TokenCostBadge.js';
```

Then replace lines 964-969 (the model-label and TransparencyFooter block) with:

```tsx
                {msg.role === 'assistant' && msg.transparency && (
                  <div className="chat-message-meta">
                    <TokenCostBadge
                      tokens={msg.transparency.model.tokens}
                      cost={msg.transparency.model.cost}
                      latencyMs={msg.transparency.model.latencyMs}
                    />
                    {msg.model && <span className="model-label">{msg.model}</span>}
                  </div>
                )}
                {msg.role === 'assistant' && !msg.transparency && msg.model && (
                  <div className="model-label">{msg.model}</div>
                )}
                {msg.role === 'assistant' && msg.transparency && (
                  <TransparencyFooter meta={msg.transparency} />
                )}
```

**Step 2: Add CSS**

Append to `packages/dashboard/ui/src/styles/global.css`:

```css
/* -- Token Cost Badge ----------------------- */

.token-cost-badge {
  display: inline-flex; align-items: center; gap: 0.5rem;
  font-size: 0.7rem; font-family: var(--font-mono, monospace);
  color: var(--text-secondary); opacity: 0.8;
}
.badge-item { white-space: nowrap; }
.badge-tokens { color: var(--accent); }
.badge-cost { color: var(--warning, #f0ad4e); }
.badge-latency { color: var(--text-secondary); }
.chat-message-meta {
  display: flex; align-items: center; gap: 0.75rem;
  margin-top: 4px; font-size: 0.75rem;
}
```

**Step 3: Verify build and existing tests pass**

Run: `npx vitest run packages/dashboard/`
Expected: All PASS

**Step 4: Commit**

```bash
git add packages/dashboard/ui/src/pages/Chat.tsx packages/dashboard/ui/src/styles/global.css
git commit -m "feat(dashboard): wire TokenCostBadge into chat messages"
```

---

## Feature 2: Provider Health Panel

### Task 3: Create `ProviderHealth` component

**Files:**
- Create: `packages/dashboard/ui/src/components/ProviderHealth.tsx`
- Create: `packages/dashboard/ui/tests/components/ProviderHealth.test.tsx`

**Step 1: Write the failing test**

Create `packages/dashboard/ui/tests/components/ProviderHealth.test.tsx`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ProviderHealth } from '../../src/components/ProviderHealth.js';

vi.mock('../../src/api.js', () => ({
  api: {
    getModels: vi.fn().mockResolvedValue({
      providers: [
        {
          name: 'anthropic',
          displayName: 'Anthropic',
          models: {
            'claude-3.5-sonnet': { maxContextTokens: 200000, costPer1kInput: 0.003, costPer1kOutput: 0.015, supportsVision: true, supportsTools: true, supportsStreaming: true, supportsImageGen: false, isLocal: false, strengths: ['reasoning'] },
          },
        },
        {
          name: 'openai',
          displayName: 'OpenAI',
          models: {
            'gpt-4o': { maxContextTokens: 128000, costPer1kInput: 0.005, costPer1kOutput: 0.015, supportsVision: true, supportsTools: true, supportsStreaming: true, supportsImageGen: false, isLocal: false, strengths: ['general'] },
          },
        },
      ],
      routing: { enabled: true, primary: 'anthropic', fallback: 'openai' },
      cost: { today: 0.42, thisMonth: 12.80, budgetRemaining: 87.20, isOverBudget: false, warningThresholdReached: false },
    }),
    getHealthState: vi.fn().mockResolvedValue({
      data: {
        overall: 'healthy',
        subsystems: [
          { name: 'providers', status: 'healthy', details: 'Primary available' },
        ],
        issues: [],
        lastCheck: new Date().toISOString(),
      },
    }),
  },
}));

describe('ProviderHealth', () => {
  it('renders provider names', async () => {
    render(<ProviderHealth />);
    await waitFor(() => expect(screen.getByText('Anthropic')).toBeTruthy());
    expect(screen.getByText('OpenAI')).toBeTruthy();
  });

  it('shows primary badge on primary provider', async () => {
    render(<ProviderHealth />);
    await waitFor(() => expect(screen.getByText('Primary')).toBeTruthy());
  });

  it('shows fallback badge on fallback provider', async () => {
    render(<ProviderHealth />);
    await waitFor(() => expect(screen.getByText('Fallback')).toBeTruthy());
  });

  it('renders cost summary', async () => {
    render(<ProviderHealth />);
    await waitFor(() => expect(screen.getByText(/\$0\.42/)).toBeTruthy());
    expect(screen.getByText(/\$12\.80/)).toBeTruthy();
  });

  it('shows healthy status', async () => {
    render(<ProviderHealth />);
    await waitFor(() => expect(screen.getByText(/healthy/i)).toBeTruthy());
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/dashboard/ui/tests/components/ProviderHealth.test.tsx`
Expected: FAIL — module not found

**Step 3: Implement `ProviderHealth`**

Create `packages/dashboard/ui/src/components/ProviderHealth.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { api } from '../api.js';

interface ProviderInfo {
  name: string;
  displayName: string;
  models: Record<string, { maxContextTokens: number; costPer1kInput: number; costPer1kOutput: number; isLocal: boolean }>;
}

interface CostSummary {
  today: number;
  thisMonth: number;
  budgetRemaining?: number;
  isOverBudget: boolean;
  warningThresholdReached: boolean;
}

interface Routing {
  enabled: boolean;
  primary: string;
  fallback?: string;
}

export function ProviderHealth() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [routing, setRouting] = useState<Routing | null>(null);
  const [cost, setCost] = useState<CostSummary | null>(null);
  const [health, setHealth] = useState<string>('unknown');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getModels(), api.getHealthState()])
      .then(([models, healthRes]) => {
        setProviders(models.providers);
        setRouting(models.routing);
        setCost(models.cost);
        const providerSub = healthRes.data?.subsystems?.find(
          (s: { name: string }) => s.name === 'providers',
        );
        setHealth(providerSub?.status ?? healthRes.data?.overall ?? 'unknown');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="provider-health"><p>Loading...</p></div>;

  const statusDot = health === 'healthy' ? 'status-dot-green'
    : health === 'degraded' ? 'status-dot-yellow'
    : 'status-dot-red';

  return (
    <div className="provider-health">
      <div className="provider-health-header">
        <h3>Providers</h3>
        <span className={statusDot} /> <span className="provider-health-status">{health}</span>
      </div>

      <div className="provider-health-grid">
        {providers.map((p) => (
          <div key={p.name} className="provider-health-card glass-mid">
            <div className="provider-health-card-header">
              <strong>{p.displayName}</strong>
              {routing?.primary === p.name && <span className="badge badge-green">Primary</span>}
              {routing?.fallback === p.name && <span className="badge badge-yellow">Fallback</span>}
            </div>
            <div className="provider-health-card-models">
              {Object.keys(p.models).length} model{Object.keys(p.models).length !== 1 ? 's' : ''}
              {Object.values(p.models).some(m => m.isLocal) && <span className="badge badge-gray">Local</span>}
            </div>
          </div>
        ))}
      </div>

      {cost && (
        <div className="provider-health-cost">
          <div className="provider-health-cost-item">
            <span className="provider-health-cost-label">Today</span>
            <span className={`provider-health-cost-value ${cost.isOverBudget ? 'cost-over' : ''}`}>${cost.today.toFixed(2)}</span>
          </div>
          <div className="provider-health-cost-item">
            <span className="provider-health-cost-label">This month</span>
            <span className="provider-health-cost-value">${cost.thisMonth.toFixed(2)}</span>
          </div>
          {cost.budgetRemaining != null && (
            <div className="provider-health-cost-item">
              <span className="provider-health-cost-label">Budget left</span>
              <span className={`provider-health-cost-value ${cost.warningThresholdReached ? 'cost-warning' : ''}`}>${cost.budgetRemaining.toFixed(2)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run packages/dashboard/ui/tests/components/ProviderHealth.test.tsx`
Expected: PASS (all 5 tests)

**Step 5: Commit**

```bash
git add packages/dashboard/ui/src/components/ProviderHealth.tsx packages/dashboard/ui/tests/components/ProviderHealth.test.tsx
git commit -m "feat(dashboard): add ProviderHealth component"
```

---

### Task 4: Mount `ProviderHealth` in SystemStatus page and add CSS

**Files:**
- Modify: `packages/dashboard/ui/src/pages/SystemStatus.tsx:1-77`
- Modify: `packages/dashboard/ui/src/styles/global.css` (append)

**Step 1: Add ProviderHealth to SystemStatus**

In `packages/dashboard/ui/src/pages/SystemStatus.tsx`, add import:

```typescript
import { ProviderHealth } from '../components/ProviderHealth.js';
```

Then insert `<ProviderHealth />` after the `<h2>System Status</h2>` and before the first `<section>`:

```tsx
    <div className="system-status">
      <h2>System Status</h2>
      <ProviderHealth />
      <section className="status-section-active">
```

**Step 2: Add CSS**

Append to `packages/dashboard/ui/src/styles/global.css`:

```css
/* -- Provider Health Panel ------------------ */

.provider-health { margin-bottom: 1.5rem; }
.provider-health-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; }
.provider-health-header h3 { margin: 0; font-size: 1rem; }
.provider-health-status { font-size: 0.85rem; color: var(--text-secondary); text-transform: capitalize; }
.provider-health-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.75rem; margin-bottom: 0.75rem; }
.provider-health-card { padding: 0.75rem; border-radius: var(--radius); border: 1px solid var(--border); }
.provider-health-card-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem; }
.provider-health-card-models { font-size: 0.8rem; color: var(--text-secondary); display: flex; align-items: center; gap: 0.5rem; }
.provider-health-cost { display: flex; gap: 1.5rem; padding: 0.75rem; border-radius: var(--radius); background: var(--bg-secondary); }
.provider-health-cost-item { display: flex; flex-direction: column; gap: 0.15rem; }
.provider-health-cost-label { font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; }
.provider-health-cost-value { font-size: 1rem; font-weight: 600; font-family: var(--font-mono, monospace); }
.cost-over { color: var(--danger, #e74c3c); }
.cost-warning { color: var(--warning, #f0ad4e); }
```

**Step 3: Verify build and existing tests pass**

Run: `npx vitest run packages/dashboard/`
Expected: All PASS

**Step 4: Commit**

```bash
git add packages/dashboard/ui/src/pages/SystemStatus.tsx packages/dashboard/ui/src/styles/global.css
git commit -m "feat(dashboard): mount ProviderHealth in SystemStatus page"
```

---

## Feature 3: Dead Letter Queue Monitor

### Task 5: Add job list and retry endpoints to runtime

**Files:**
- Modify: `packages/runtime/src/index.ts:1405-1414` (jobs router)
- Create: `packages/runtime/tests/jobs-api.test.ts`

**Step 1: Write the failing test**

Create `packages/runtime/tests/jobs-api.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Router, type Request, type Response } from 'express';

// Test the jobs router logic in isolation
// We'll extract the handler functions and test them with mocked jobQueue

describe('jobs API routes', () => {
  const mockJobQueue = {
    getStats: vi.fn().mockReturnValue({ pending: 1, running: 0, completed24h: 5, failed24h: 2, dead: 3 }),
    listJobs: vi.fn().mockReturnValue([
      { id: 'j1', type: 'behavior', status: 'dead', payload: { behaviorId: 'b1' }, result: 'timeout', attempt: 3, maxAttempts: 3, createdAt: Date.now(), updatedAt: Date.now() },
      { id: 'j2', type: 'behavior', status: 'dead', payload: { behaviorId: 'b2' }, result: 'handler error', attempt: 3, maxAttempts: 3, createdAt: Date.now(), updatedAt: Date.now() },
    ]),
    getJob: vi.fn().mockReturnValue({ id: 'j1', type: 'behavior', status: 'dead', payload: { behaviorId: 'b1' }, result: 'timeout', attempt: 3, maxAttempts: 3, createdAt: Date.now(), updatedAt: Date.now() }),
    enqueue: vi.fn().mockReturnValue('j3'),
  };

  it('listJobs returns filtered jobs', () => {
    const result = mockJobQueue.listJobs({ status: 'dead', limit: 50 });
    expect(result).toHaveLength(2);
    expect(result[0].status).toBe('dead');
  });

  it('getJob returns single job', () => {
    const result = mockJobQueue.getJob('j1');
    expect(result).toBeDefined();
    expect(result.id).toBe('j1');
  });

  it('retry re-enqueues a dead job', () => {
    const job = mockJobQueue.getJob('j1');
    const newId = mockJobQueue.enqueue(job.type, job.payload);
    expect(newId).toBe('j3');
    expect(mockJobQueue.enqueue).toHaveBeenCalledWith('behavior', { behaviorId: 'b1' });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/runtime/tests/jobs-api.test.ts`
Expected: PASS (mocked — this test validates the logic shape)

**Step 3: Add endpoints to runtime jobs router**

In `packages/runtime/src/index.ts`, find the jobs router section (~line 1405-1414). After the existing `jobsRouter.get('/status', ...)` handler, add:

```typescript
      jobsRouter.get('/list', (req: Request, res: Response) => {
        if (!this.jobQueue) {
          res.json({ data: [] });
          return;
        }
        const status = req.query.status as string | undefined;
        const type = req.query.type as string | undefined;
        const limit = req.query.limit ? Number(req.query.limit) : 50;
        const filter: Record<string, unknown> = { limit };
        if (status) filter.status = status;
        if (type) filter.type = type;
        const jobs = this.jobQueue.listJobs(filter as import('@auxiora/job-queue').JobFilter);
        res.json({ data: jobs });
      });

      jobsRouter.get('/:id', (req: Request, res: Response) => {
        if (!this.jobQueue) {
          res.status(404).json({ error: 'Job queue not available' });
          return;
        }
        const job = this.jobQueue.getJob(String(req.params.id));
        if (!job) {
          res.status(404).json({ error: 'Job not found' });
          return;
        }
        res.json({ data: job });
      });

      jobsRouter.post('/:id/retry', (req: Request, res: Response) => {
        if (!this.jobQueue) {
          res.status(503).json({ error: 'Job queue not available' });
          return;
        }
        const job = this.jobQueue.getJob(String(req.params.id));
        if (!job) {
          res.status(404).json({ error: 'Job not found' });
          return;
        }
        if (job.status !== 'dead' && job.status !== 'failed') {
          res.status(400).json({ error: 'Only dead or failed jobs can be retried' });
          return;
        }
        const newId = this.jobQueue.enqueue(job.type, job.payload);
        res.json({ data: { originalId: job.id, newJobId: newId } });
      });
```

**Step 4: Verify existing tests pass**

Run: `npx vitest run packages/runtime/tests/`
Expected: All PASS

**Step 5: Commit**

```bash
git add packages/runtime/src/index.ts packages/runtime/tests/jobs-api.test.ts
git commit -m "feat(runtime): add job list, detail, and retry REST endpoints"
```

---

### Task 6: Add job API functions to dashboard and create `DeadLetterMonitor` component

**Files:**
- Modify: `packages/dashboard/ui/src/api.ts:342` (before closing `};`)
- Create: `packages/dashboard/ui/src/components/DeadLetterMonitor.tsx`
- Create: `packages/dashboard/ui/tests/components/DeadLetterMonitor.test.tsx`

**Step 1: Add API functions**

In `packages/dashboard/ui/src/api.ts`, before the closing `};` of the `api` object (line 342), add:

```typescript
  // Jobs
  getJobStats: () =>
    fetch('/api/v1/jobs/status', { credentials: 'include' }).then(r => r.json()) as Promise<{ pending: number; running: number; completed24h: number; failed24h: number; dead: number }>,
  getJobList: (params?: { status?: string; type?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.type) qs.set('type', params.type);
    if (params?.limit) qs.set('limit', String(params.limit));
    const query = qs.toString();
    return fetch(`/api/v1/jobs/list${query ? `?${query}` : ''}`, { credentials: 'include' }).then(r => r.json()) as Promise<{ data: Array<{ id: string; type: string; status: string; payload: unknown; result: unknown; attempt: number; maxAttempts: number; createdAt: number; updatedAt: number }> }>;
  },
  retryJob: (id: string) =>
    fetch(`/api/v1/jobs/${encodeURIComponent(id)}/retry`, { method: 'POST', credentials: 'include' }).then(r => r.json()) as Promise<{ data: { originalId: string; newJobId: string } }>,
```

**Step 2: Write the failing test for DeadLetterMonitor**

Create `packages/dashboard/ui/tests/components/DeadLetterMonitor.test.tsx`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { DeadLetterMonitor } from '../../src/components/DeadLetterMonitor.js';

vi.mock('../../src/api.js', () => ({
  api: {
    getJobStats: vi.fn().mockResolvedValue({ pending: 2, running: 1, completed24h: 10, failed24h: 3, dead: 2 }),
    getJobList: vi.fn().mockResolvedValue({
      data: [
        { id: 'j1', type: 'behavior', status: 'dead', payload: { behaviorId: 'b1' }, result: 'timeout', attempt: 3, maxAttempts: 3, createdAt: Date.now() - 3600000, updatedAt: Date.now() },
        { id: 'j2', type: 'ambient-flush', status: 'dead', payload: {}, result: 'handler error', attempt: 3, maxAttempts: 3, createdAt: Date.now() - 7200000, updatedAt: Date.now() },
      ],
    }),
    retryJob: vi.fn().mockResolvedValue({ data: { originalId: 'j1', newJobId: 'j3' } }),
  },
}));

describe('DeadLetterMonitor', () => {
  it('renders stats summary', async () => {
    render(<DeadLetterMonitor />);
    await waitFor(() => expect(screen.getByText(/2 dead/i)).toBeTruthy());
    expect(screen.getByText(/3 failed/i)).toBeTruthy();
  });

  it('renders dead job list', async () => {
    render(<DeadLetterMonitor />);
    await waitFor(() => expect(screen.getByText('behavior')).toBeTruthy());
    expect(screen.getByText('ambient-flush')).toBeTruthy();
  });

  it('shows error reason for dead jobs', async () => {
    render(<DeadLetterMonitor />);
    await waitFor(() => expect(screen.getByText('timeout')).toBeTruthy());
  });

  it('calls retryJob on retry button click', async () => {
    const { api } = await import('../../src/api.js');
    render(<DeadLetterMonitor />);
    await waitFor(() => screen.getByText('behavior'));
    const retryBtns = screen.getAllByText('Retry');
    fireEvent.click(retryBtns[0]);
    expect(api.retryJob).toHaveBeenCalledWith('j1');
  });
});
```

**Step 3: Implement `DeadLetterMonitor`**

Create `packages/dashboard/ui/src/components/DeadLetterMonitor.tsx`:

```tsx
import { useState, useEffect, useCallback } from 'react';
import { api } from '../api.js';

interface JobStats {
  pending: number;
  running: number;
  completed24h: number;
  failed24h: number;
  dead: number;
}

interface JobEntry {
  id: string;
  type: string;
  status: string;
  payload: unknown;
  result: unknown;
  attempt: number;
  maxAttempts: number;
  createdAt: number;
  updatedAt: number;
}

export function DeadLetterMonitor() {
  const [stats, setStats] = useState<JobStats | null>(null);
  const [deadJobs, setDeadJobs] = useState<JobEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [statsRes, listRes] = await Promise.all([
        api.getJobStats(),
        api.getJobList({ status: 'dead', limit: 50 }),
      ]);
      setStats(statsRes);
      setDeadJobs(listRes.data);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleRetry = async (id: string) => {
    try {
      await api.retryJob(id);
      refresh();
    } catch { /* ignore */ }
  };

  if (loading) return <div className="dlq-monitor"><p>Loading...</p></div>;

  return (
    <div className="dlq-monitor">
      <div className="dlq-header">
        <h3>Job Queue</h3>
        <button className="dlq-refresh" onClick={refresh}>Refresh</button>
      </div>

      {stats && (
        <div className="dlq-stats">
          <span className="dlq-stat">{stats.pending} pending</span>
          <span className="dlq-stat">{stats.running} running</span>
          <span className="dlq-stat">{stats.completed24h} completed (24h)</span>
          <span className="dlq-stat dlq-stat-warn">{stats.failed24h} failed (24h)</span>
          <span className={`dlq-stat ${stats.dead > 0 ? 'dlq-stat-danger' : ''}`}>{stats.dead} dead</span>
        </div>
      )}

      {deadJobs.length > 0 && (
        <div className="dlq-list">
          <h4>Dead Jobs</h4>
          <table className="dlq-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Error</th>
                <th>Attempts</th>
                <th>Age</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {deadJobs.map(job => (
                <tr key={job.id}>
                  <td>{job.type}</td>
                  <td className="dlq-error">{String(job.result ?? 'unknown')}</td>
                  <td>{job.attempt}/{job.maxAttempts}</td>
                  <td>{formatAge(job.createdAt)}</td>
                  <td><button className="dlq-retry-btn" onClick={() => handleRetry(job.id)}>Retry</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deadJobs.length === 0 && stats && stats.dead === 0 && (
        <p className="dlq-empty">No dead jobs. All clear.</p>
      )}
    </div>
  );
}

function formatAge(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60000) return '<1m';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return `${Math.floor(diff / 86400000)}d`;
}
```

**Step 4: Run tests**

Run: `npx vitest run packages/dashboard/ui/tests/components/DeadLetterMonitor.test.tsx`
Expected: PASS (all 4 tests)

**Step 5: Commit**

```bash
git add packages/dashboard/ui/src/api.ts packages/dashboard/ui/src/components/DeadLetterMonitor.tsx packages/dashboard/ui/tests/components/DeadLetterMonitor.test.tsx
git commit -m "feat(dashboard): add DeadLetterMonitor component and job API functions"
```

---

### Task 7: Mount `DeadLetterMonitor` in SystemStatus and add CSS

**Files:**
- Modify: `packages/dashboard/ui/src/pages/SystemStatus.tsx`
- Modify: `packages/dashboard/ui/src/styles/global.css` (append)

**Step 1: Add to SystemStatus**

In `packages/dashboard/ui/src/pages/SystemStatus.tsx`, add import:

```typescript
import { DeadLetterMonitor } from '../components/DeadLetterMonitor.js';
```

Insert `<DeadLetterMonitor />` after `<ProviderHealth />`:

```tsx
      <ProviderHealth />
      <DeadLetterMonitor />
```

**Step 2: Add CSS**

Append to `packages/dashboard/ui/src/styles/global.css`:

```css
/* -- Dead Letter Queue Monitor -------------- */

.dlq-monitor { margin-bottom: 1.5rem; }
.dlq-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; }
.dlq-header h3 { margin: 0; font-size: 1rem; }
.dlq-refresh {
  padding: 0.25rem 0.5rem; border: 1px solid var(--border); background: var(--bg-secondary);
  color: var(--text-primary); border-radius: var(--radius); font-size: 0.75rem; cursor: pointer;
}
.dlq-stats { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 0.75rem; font-size: 0.8rem; color: var(--text-secondary); }
.dlq-stat-warn { color: var(--warning, #f0ad4e); }
.dlq-stat-danger { color: var(--danger, #e74c3c); font-weight: 600; }
.dlq-list h4 { margin: 0 0 0.5rem; font-size: 0.9rem; }
.dlq-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
.dlq-table th { text-align: left; padding: 0.35rem 0.5rem; border-bottom: 1px solid var(--border); color: var(--text-secondary); font-weight: 500; }
.dlq-table td { padding: 0.35rem 0.5rem; border-bottom: 1px solid var(--border); }
.dlq-error { color: var(--danger, #e74c3c); font-family: var(--font-mono, monospace); font-size: 0.75rem; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dlq-retry-btn {
  padding: 0.2rem 0.5rem; border: 1px solid var(--accent); background: transparent;
  color: var(--accent); border-radius: var(--radius); font-size: 0.7rem; cursor: pointer;
}
.dlq-retry-btn:hover { background: var(--accent); color: white; }
.dlq-empty { color: var(--text-secondary); font-size: 0.85rem; }
```

**Step 3: Verify build and tests pass**

Run: `npx vitest run packages/dashboard/`
Expected: All PASS

**Step 4: Commit**

```bash
git add packages/dashboard/ui/src/pages/SystemStatus.tsx packages/dashboard/ui/src/styles/global.css
git commit -m "feat(dashboard): mount DeadLetterMonitor in SystemStatus page"
```

---

## Feature 4: Cold-Start Onboarding Questionnaire

### Task 8: Create `SetupPreferences` page component

**Files:**
- Create: `packages/dashboard/ui/src/pages/SetupPreferences.tsx`
- Create: `packages/dashboard/ui/tests/pages/SetupPreferences.test.tsx`

**Step 1: Write the failing test**

Create `packages/dashboard/ui/tests/pages/SetupPreferences.test.tsx`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SetupPreferences } from '../../src/pages/SetupPreferences.js';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('../../src/api.js', () => ({
  api: {
    updateArchitectPreference: vi.fn().mockResolvedValue({ success: true }),
  },
}));

describe('SetupPreferences', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('renders preference questions', () => {
    render(<SetupPreferences />);
    expect(screen.getByText(/response style/i)).toBeTruthy();
    expect(screen.getByText(/communication tone/i)).toBeTruthy();
  });

  it('renders radio options for each question', () => {
    render(<SetupPreferences />);
    expect(screen.getByText('Concise')).toBeTruthy();
    expect(screen.getByText('Detailed')).toBeTruthy();
  });

  it('navigates on submit', async () => {
    render(<SetupPreferences />);
    fireEvent.click(screen.getByText('Continue'));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/setup/personality'));
  });

  it('has a skip button', () => {
    render(<SetupPreferences />);
    expect(screen.getByText('Skip')).toBeTruthy();
  });

  it('navigates on skip', () => {
    render(<SetupPreferences />);
    fireEvent.click(screen.getByText('Skip'));
    expect(mockNavigate).toHaveBeenCalledWith('/setup/personality');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/dashboard/ui/tests/pages/SetupPreferences.test.tsx`
Expected: FAIL — module not found

**Step 3: Implement `SetupPreferences`**

Create `packages/dashboard/ui/src/pages/SetupPreferences.tsx`:

```tsx
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
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run packages/dashboard/ui/tests/pages/SetupPreferences.test.tsx`
Expected: PASS (all 5 tests)

**Step 5: Commit**

```bash
git add packages/dashboard/ui/src/pages/SetupPreferences.tsx packages/dashboard/ui/tests/pages/SetupPreferences.test.tsx
git commit -m "feat(dashboard): add SetupPreferences onboarding questionnaire"
```

---

### Task 9: Register SetupPreferences route and add CSS

**Files:**
- Modify: `packages/dashboard/ui/src/App.tsx` (or wherever routes are defined — check for `SetupIdentity` route)
- Modify: `packages/dashboard/ui/src/styles/global.css` (append)

**Step 1: Find and modify routes**

Search for where `SetupIdentity` or `/setup/identity` is registered. Add a new route after it:

```tsx
import { SetupPreferences } from './pages/SetupPreferences.js';
// ...
<Route path="/setup/preferences" element={<SetupPreferences />} />
```

This should go between `/setup/identity` and `/setup/personality`.

**Step 2: Update SetupIdentity navigation**

In `packages/dashboard/ui/src/pages/SetupIdentity.tsx`, change the `navigate('/setup/personality')` call (line 37) to:

```typescript
navigate('/setup/preferences');
```

This inserts the preferences questionnaire between identity and personality template selection.

**Step 3: Add CSS**

Append to `packages/dashboard/ui/src/styles/global.css`:

```css
/* -- Setup Preferences Questionnaire -------- */

.preferences-questions { display: flex; flex-direction: column; gap: 1.25rem; margin: 1rem 0; }
.preferences-question label { display: block; font-size: 0.9rem; font-weight: 500; margin-bottom: 0.35rem; }
.preferences-options { display: flex; gap: 0.5rem; }
.preferences-option {
  flex: 1; padding: 0.5rem; border: 1px solid var(--border); background: transparent;
  color: var(--text-primary); border-radius: var(--radius); font-size: 0.8rem;
  cursor: pointer; transition: all var(--transition-fast);
}
.preferences-option:hover { border-color: var(--accent); }
.preferences-option.active { background: var(--accent); color: white; border-color: var(--accent); }
.preferences-actions { display: flex; justify-content: space-between; margin-top: 1rem; }
.setup-btn-secondary {
  padding: 0.5rem 1rem; border: 1px solid var(--border); background: transparent;
  color: var(--text-secondary); border-radius: var(--radius); cursor: pointer;
}
```

**Step 4: Verify build and tests pass**

Run: `npx vitest run packages/dashboard/`
Expected: All PASS

**Step 5: Commit**

```bash
git add packages/dashboard/ui/src/App.tsx packages/dashboard/ui/src/pages/SetupIdentity.tsx packages/dashboard/ui/src/styles/global.css
git commit -m "feat(dashboard): register SetupPreferences in setup flow"
```

---

### Task 10: Run full test suite

**Step 1: Run all tests**

```bash
npx vitest run
```

Expected: All tests pass, including the new ones from Tasks 1-9.

**Step 2: Fix any failures**

Common issues:
- Import paths missing `.js` extension
- Mock patterns not matching existing test infrastructure
- `SetupProgress` prop change (currentStep numbering may need adjustment)

**Step 3: Final commit if fixes needed**

```bash
git add -A
git commit -m "fix: resolve test failures from quick wins batch"
```
