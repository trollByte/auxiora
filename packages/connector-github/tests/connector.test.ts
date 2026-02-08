import { describe, it, expect } from 'vitest';
import { githubConnector } from '../src/connector.js';

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
    const result = await githubConnector.executeAction(
      'issues-create',
      { owner: 'test', repo: 'repo', title: 'Bug' },
      'token',
    ) as any;
    expect(result.status).toBe('created');
    expect(result.title).toBe('Bug');
  });

  it('should execute repos-get action', async () => {
    const result = await githubConnector.executeAction(
      'repos-get',
      { owner: 'test', repo: 'repo' },
      'token',
    ) as any;
    expect(result.owner).toBe('test');
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
