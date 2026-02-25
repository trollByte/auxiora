import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { linearConnector } from '../src/connector.js';

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('Linear Connector', () => {
  it('should have correct metadata', () => {
    expect(linearConnector.id).toBe('linear');
    expect(linearConnector.name).toBe('Linear');
    expect(linearConnector.category).toBe('devtools');
  });

  it('should use OAuth2 authentication', () => {
    expect(linearConnector.auth.type).toBe('oauth2');
    expect(linearConnector.auth.oauth2?.scopes).toContain('read');
  });

  it('should define issue actions', () => {
    const issueActions = linearConnector.actions.filter((a) => a.id.startsWith('issues-'));
    expect(issueActions.length).toBe(5);
    expect(issueActions.map((a) => a.id)).toContain('issues-create');
    expect(issueActions.map((a) => a.id)).toContain('issues-comment');
  });

  it('should define project actions', () => {
    const projectActions = linearConnector.actions.filter((a) => a.id.startsWith('projects-'));
    expect(projectActions.length).toBe(2);
  });

  it('should define cycle actions', () => {
    const cycleActions = linearConnector.actions.filter((a) => a.id.startsWith('cycles-'));
    expect(cycleActions.length).toBe(2);
  });

  it('should define triggers', () => {
    expect(linearConnector.triggers).toHaveLength(2);
    const triggerIds = linearConnector.triggers.map((t) => t.id);
    expect(triggerIds).toContain('issue-created');
    expect(triggerIds).toContain('status-changed');
  });

  it('should define entities', () => {
    expect(linearConnector.entities).toHaveLength(3);
    const entityIds = linearConnector.entities.map((e) => e.id);
    expect(entityIds).toContain('issue');
    expect(entityIds).toContain('project');
    expect(entityIds).toContain('cycle');
  });

  it('should execute issues-create action', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          issueCreate: {
            issue: { id: 'issue-1', identifier: 'BUG-1', title: 'Bug fix' },
            success: true,
          },
        },
      }),
    });
    const result = await linearConnector.executeAction(
      'issues-create',
      { teamId: 'team-1', title: 'Bug fix' },
      'token',
    ) as any;
    expect(result.success).toBe(true);
    expect(result.issue.title).toBe('Bug fix');
  });

  it('should execute cycles-current action', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          team: {
            activeCycle: {
              id: 'cycle-1',
              name: 'Sprint 1',
              number: 1,
              startsAt: '2025-01-01T00:00:00Z',
              endsAt: '2025-01-14T00:00:00Z',
              progress: 0.5,
            },
          },
        },
      }),
    });
    const result = await linearConnector.executeAction(
      'cycles-current',
      { teamId: 'team-1' },
      'token',
    ) as any;
    expect(result.id).toBe('cycle-1');
    expect(result.name).toBe('Sprint 1');
  });

  it('should throw for unknown action', async () => {
    await expect(linearConnector.executeAction('unknown', {}, 'token')).rejects.toThrow('Unknown action');
  });
});
