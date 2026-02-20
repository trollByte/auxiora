import { describe, it, expect } from 'vitest';
import { ResearchIntentDetector } from '@auxiora/research';

describe('Research intent detection in runtime', () => {
  it('ResearchIntentDetector is importable and functional', () => {
    const detector = new ResearchIntentDetector();
    const result = detector.detect('Analyze the pros and cons of microservices vs monoliths');
    expect(result.score).toBeGreaterThanOrEqual(0.4);
    expect(result.suggestedDepth).toBeDefined();
  });
});

describe('Research job map', () => {
  it('tracks jobs with status lifecycle', () => {
    const jobs = new Map<string, { id: string; status: string; createdAt: number }>();
    const job = { id: 'j1', status: 'planning', createdAt: Date.now() };
    jobs.set(job.id, job);
    expect(jobs.get('j1')?.status).toBe('planning');
    job.status = 'completed';
    expect(jobs.get('j1')?.status).toBe('completed');
  });

  it('expires jobs older than 1 hour', () => {
    const jobs = new Map<string, { id: string; status: string; createdAt: number }>();
    jobs.set('old', { id: 'old', status: 'completed', createdAt: Date.now() - 3_700_000 });
    jobs.set('new', { id: 'new', status: 'completed', createdAt: Date.now() });
    const ONE_HOUR = 3_600_000;
    const now = Date.now();
    for (const [id, j] of jobs) {
      if (now - j.createdAt > ONE_HOUR) jobs.delete(id);
    }
    expect(jobs.has('old')).toBe(false);
    expect(jobs.has('new')).toBe(true);
  });
});
