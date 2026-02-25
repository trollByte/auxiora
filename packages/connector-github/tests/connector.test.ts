import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { githubConnector } from '../src/connector.js';

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('GitHub Connector', () => {
  it('should have correct metadata', () => {
    expect(githubConnector.id).toBe('github');
    expect(githubConnector.name).toBe('GitHub');
    expect(githubConnector.category).toBe('devtools');
    expect(githubConnector.version).toBe('1.0.0');
  });

  it('should use OAuth2 authentication', () => {
    expect(githubConnector.auth.type).toBe('oauth2');
    expect(githubConnector.auth.oauth2?.scopes).toContain('repo');
  });

  it('should define issue actions', () => {
    const issueActions = githubConnector.actions.filter((a) => a.id.startsWith('issues-'));
    expect(issueActions.length).toBe(4);
    expect(issueActions.map((a) => a.id)).toContain('issues-list');
    expect(issueActions.map((a) => a.id)).toContain('issues-create');
    expect(issueActions.map((a) => a.id)).toContain('issues-update');
    expect(issueActions.map((a) => a.id)).toContain('issues-comment');
  });

  it('should define PR actions', () => {
    const prActions = githubConnector.actions.filter((a) => a.id.startsWith('prs-'));
    expect(prActions.length).toBe(3);
    expect(prActions.map((a) => a.id)).toContain('prs-merge');
  });

  it('should define Actions/workflow actions', () => {
    const actionsActions = githubConnector.actions.filter((a) => a.id.startsWith('actions-'));
    expect(actionsActions.length).toBe(2);
  });

  it('should define repo actions', () => {
    const repoActions = githubConnector.actions.filter((a) => a.id.startsWith('repos-'));
    expect(repoActions.length).toBe(2);
  });

  it('should define triggers', () => {
    expect(githubConnector.triggers).toHaveLength(3);
    const triggerIds = githubConnector.triggers.map((t) => t.id);
    expect(triggerIds).toContain('pr-opened');
    expect(triggerIds).toContain('issue-created');
    expect(triggerIds).toContain('workflow-failed');
  });

  it('should require high trust for merging PRs', () => {
    const mergeAction = githubConnector.actions.find((a) => a.id === 'prs-merge');
    expect(mergeAction?.trustMinimum).toBe(4);
  });

  it('should execute issues-create action', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ number: 1, title: 'Bug', state: 'open', html_url: 'https://github.com/test/repo/issues/1' }),
    });
    const result = await githubConnector.executeAction(
      'issues-create',
      { owner: 'test', repo: 'repo', title: 'Bug' },
      'token',
    ) as any;
    expect(result.status).toBe('created');
    expect(result.title).toBe('Bug');
  });

  it('should execute repos-get action', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        name: 'repo',
        full_name: 'test/repo',
        private: false,
        default_branch: 'main',
        description: 'A test repo',
        stargazers_count: 10,
        forks_count: 2,
        html_url: 'https://github.com/test/repo',
      }),
    });
    const result = await githubConnector.executeAction(
      'repos-get',
      { owner: 'test', repo: 'repo' },
      'token',
    ) as any;
    expect(result.fullName).toBe('test/repo');
    expect(result.defaultBranch).toBe('main');
  });

  it('should throw for unknown action', async () => {
    await expect(githubConnector.executeAction('unknown', {}, 'token')).rejects.toThrow('Unknown action');
  });

  it('should return empty events from pollTrigger', async () => {
    const events = await githubConnector.pollTrigger!('pr-opened', 'token');
    expect(events).toEqual([]);
  });
});
