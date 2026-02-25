import { defineConnector } from '@auxiora/connectors';
import type { TriggerEvent } from '@auxiora/connectors';

const GITHUB_API = 'https://api.github.com';

async function ghFetch(path: string, token: string, options: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API error ${res.status}: ${body}`);
  }
  return res;
}

async function ghJson<T = unknown>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const res = await ghFetch(path, token, options);
  // 204 No Content (e.g. workflow dispatch) returns no body
  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}

export const githubConnector = defineConnector({
  id: 'github',
  name: 'GitHub',
  description: 'Integration with GitHub Issues, PRs, Actions, and Repos',
  version: '1.0.0',
  category: 'devtools',
  icon: 'github',

  auth: {
    type: 'oauth2',
    oauth2: {
      authUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      scopes: ['repo', 'workflow', 'read:org'],
    },
    instructions: 'You can also use a Personal Access Token (PAT) with token auth type.',
  },

  actions: [
    // --- Issues ---
    {
      id: 'issues-list',
      name: 'List Issues',
      description: 'List issues in a repository',
      trustMinimum: 1,
      trustDomain: 'integrations',
      reversible: false,
      sideEffects: false,
      params: {
        owner: { type: 'string', description: 'Repository owner', required: true },
        repo: { type: 'string', description: 'Repository name', required: true },
        state: { type: 'string', description: 'Issue state (open, closed, all)', default: 'open' },
      },
    },
    {
      id: 'issues-create',
      name: 'Create Issue',
      description: 'Create a new issue',
      trustMinimum: 2,
      trustDomain: 'integrations',
      reversible: true,
      sideEffects: true,
      params: {
        owner: { type: 'string', description: 'Repository owner', required: true },
        repo: { type: 'string', description: 'Repository name', required: true },
        title: { type: 'string', description: 'Issue title', required: true },
        body: { type: 'string', description: 'Issue body' },
        labels: { type: 'array', description: 'Issue labels' },
        assignees: { type: 'array', description: 'Assignees' },
      },
    },
    {
      id: 'issues-update',
      name: 'Update Issue',
      description: 'Update an existing issue',
      trustMinimum: 2,
      trustDomain: 'integrations',
      reversible: true,
      sideEffects: true,
      params: {
        owner: { type: 'string', description: 'Repository owner', required: true },
        repo: { type: 'string', description: 'Repository name', required: true },
        issueNumber: { type: 'number', description: 'Issue number', required: true },
        title: { type: 'string', description: 'Updated title' },
        body: { type: 'string', description: 'Updated body' },
        state: { type: 'string', description: 'State (open, closed)' },
      },
    },
    {
      id: 'issues-comment',
      name: 'Comment on Issue',
      description: 'Add a comment to an issue',
      trustMinimum: 2,
      trustDomain: 'integrations',
      reversible: true,
      sideEffects: true,
      params: {
        owner: { type: 'string', description: 'Repository owner', required: true },
        repo: { type: 'string', description: 'Repository name', required: true },
        issueNumber: { type: 'number', description: 'Issue number', required: true },
        body: { type: 'string', description: 'Comment body', required: true },
      },
    },
    // --- PRs ---
    {
      id: 'prs-list',
      name: 'List Pull Requests',
      description: 'List pull requests in a repository',
      trustMinimum: 1,
      trustDomain: 'integrations',
      reversible: false,
      sideEffects: false,
      params: {
        owner: { type: 'string', description: 'Repository owner', required: true },
        repo: { type: 'string', description: 'Repository name', required: true },
        state: { type: 'string', description: 'PR state', default: 'open' },
      },
    },
    {
      id: 'prs-create',
      name: 'Create Pull Request',
      description: 'Create a new pull request',
      trustMinimum: 3,
      trustDomain: 'integrations',
      reversible: true,
      sideEffects: true,
      params: {
        owner: { type: 'string', description: 'Repository owner', required: true },
        repo: { type: 'string', description: 'Repository name', required: true },
        title: { type: 'string', description: 'PR title', required: true },
        head: { type: 'string', description: 'Head branch', required: true },
        base: { type: 'string', description: 'Base branch', required: true },
        body: { type: 'string', description: 'PR description' },
      },
    },
    {
      id: 'prs-merge',
      name: 'Merge Pull Request',
      description: 'Merge a pull request',
      trustMinimum: 4,
      trustDomain: 'integrations',
      reversible: false,
      sideEffects: true,
      params: {
        owner: { type: 'string', description: 'Repository owner', required: true },
        repo: { type: 'string', description: 'Repository name', required: true },
        pullNumber: { type: 'number', description: 'PR number', required: true },
        mergeMethod: { type: 'string', description: 'Merge method (merge, squash, rebase)', default: 'merge' },
      },
    },
    // --- Actions ---
    {
      id: 'actions-list-runs',
      name: 'List Workflow Runs',
      description: 'List recent workflow runs',
      trustMinimum: 1,
      trustDomain: 'integrations',
      reversible: false,
      sideEffects: false,
      params: {
        owner: { type: 'string', description: 'Repository owner', required: true },
        repo: { type: 'string', description: 'Repository name', required: true },
      },
    },
    {
      id: 'actions-trigger',
      name: 'Trigger Workflow',
      description: 'Trigger a workflow dispatch',
      trustMinimum: 3,
      trustDomain: 'integrations',
      reversible: false,
      sideEffects: true,
      params: {
        owner: { type: 'string', description: 'Repository owner', required: true },
        repo: { type: 'string', description: 'Repository name', required: true },
        workflowId: { type: 'string', description: 'Workflow ID or filename', required: true },
        ref: { type: 'string', description: 'Git ref', default: 'main' },
      },
    },
    // --- Repos ---
    {
      id: 'repos-list',
      name: 'List Repositories',
      description: 'List repositories for the authenticated user',
      trustMinimum: 1,
      trustDomain: 'integrations',
      reversible: false,
      sideEffects: false,
      params: {
        type: { type: 'string', description: 'Type (all, owner, member)', default: 'all' },
      },
    },
    {
      id: 'repos-get',
      name: 'Get Repository',
      description: 'Get details of a repository',
      trustMinimum: 1,
      trustDomain: 'integrations',
      reversible: false,
      sideEffects: false,
      params: {
        owner: { type: 'string', description: 'Repository owner', required: true },
        repo: { type: 'string', description: 'Repository name', required: true },
      },
    },
  ],

  triggers: [
    {
      id: 'pr-opened',
      name: 'PR Opened',
      description: 'Triggered when a new pull request is opened',
      type: 'poll',
      pollIntervalMs: 120_000,
    },
    {
      id: 'issue-created',
      name: 'Issue Created',
      description: 'Triggered when a new issue is created',
      type: 'poll',
      pollIntervalMs: 120_000,
    },
    {
      id: 'workflow-failed',
      name: 'Workflow Failed',
      description: 'Triggered when a workflow run fails',
      type: 'poll',
      pollIntervalMs: 120_000,
    },
  ],

  entities: [
    {
      id: 'issue',
      name: 'Issue',
      description: 'A GitHub issue',
      fields: { number: 'number', title: 'string', state: 'string', body: 'string', labels: 'array' },
    },
    {
      id: 'pull-request',
      name: 'Pull Request',
      description: 'A GitHub pull request',
      fields: { number: 'number', title: 'string', state: 'string', head: 'string', base: 'string' },
    },
    {
      id: 'repository',
      name: 'Repository',
      description: 'A GitHub repository',
      fields: { name: 'string', fullName: 'string', private: 'boolean', defaultBranch: 'string' },
    },
  ],

  async executeAction(actionId: string, params: Record<string, unknown>, token: string): Promise<unknown> {
    switch (actionId) {
      // --- Issues ---
      case 'issues-list': {
        const owner = params.owner as string;
        const repo = params.repo as string;
        const state = (params.state as string) ?? 'open';
        const items = await ghJson<Array<{ number: number; title: string; state: string; body: string | null; labels: Array<{ name: string }> }>>(
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?state=${encodeURIComponent(state)}`,
          token,
        );
        return {
          issues: items.map(i => ({
            number: i.number,
            title: i.title,
            state: i.state,
            body: i.body ?? '',
            labels: i.labels.map(l => l.name),
          })),
        };
      }

      case 'issues-create': {
        const owner = params.owner as string;
        const repo = params.repo as string;
        const issue = await ghJson<{ number: number; title: string; state: string; html_url: string }>(
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`,
          token,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: params.title as string,
              body: params.body as string | undefined,
              labels: params.labels as string[] | undefined,
              assignees: params.assignees as string[] | undefined,
            }),
          },
        );
        return { issueNumber: issue.number, status: 'created', title: issue.title, url: issue.html_url };
      }

      case 'issues-update': {
        const owner = params.owner as string;
        const repo = params.repo as string;
        const issueNumber = params.issueNumber as number;
        const body: Record<string, unknown> = {};
        if (params.title !== undefined) body.title = params.title;
        if (params.body !== undefined) body.body = params.body;
        if (params.state !== undefined) body.state = params.state;
        const issue = await ghJson<{ number: number; title: string; state: string }>(
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}`,
          token,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          },
        );
        return { issueNumber: issue.number, status: 'updated', title: issue.title, state: issue.state };
      }

      case 'issues-comment': {
        const owner = params.owner as string;
        const repo = params.repo as string;
        const issueNumber = params.issueNumber as number;
        const comment = await ghJson<{ id: number; html_url: string }>(
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/comments`,
          token,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ body: params.body as string }),
          },
        );
        return { commentId: comment.id, status: 'created', url: comment.html_url };
      }

      // --- Pull Requests ---
      case 'prs-list': {
        const owner = params.owner as string;
        const repo = params.repo as string;
        const state = (params.state as string) ?? 'open';
        const items = await ghJson<Array<{ number: number; title: string; state: string; head: { ref: string }; base: { ref: string } }>>(
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=${encodeURIComponent(state)}`,
          token,
        );
        return {
          pullRequests: items.map(pr => ({
            number: pr.number,
            title: pr.title,
            state: pr.state,
            head: pr.head.ref,
            base: pr.base.ref,
          })),
        };
      }

      case 'prs-create': {
        const owner = params.owner as string;
        const repo = params.repo as string;
        const pr = await ghJson<{ number: number; title: string; state: string; html_url: string }>(
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`,
          token,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: params.title as string,
              head: params.head as string,
              base: params.base as string,
              body: params.body as string | undefined,
            }),
          },
        );
        return { pullNumber: pr.number, status: 'created', title: pr.title, url: pr.html_url };
      }

      case 'prs-merge': {
        const owner = params.owner as string;
        const repo = params.repo as string;
        const pullNumber = params.pullNumber as number;
        const result = await ghJson<{ merged: boolean; message: string }>(
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullNumber}/merge`,
          token,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              merge_method: (params.mergeMethod as string) ?? 'merge',
            }),
          },
        );
        return { pullNumber, status: result.merged ? 'merged' : 'failed', message: result.message };
      }

      // --- Actions ---
      case 'actions-list-runs': {
        const owner = params.owner as string;
        const repo = params.repo as string;
        const data = await ghJson<{ workflow_runs: Array<{ id: number; name: string | null; status: string; conclusion: string | null; html_url: string; created_at: string }> }>(
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs`,
          token,
        );
        return {
          runs: data.workflow_runs.map(r => ({
            id: r.id,
            name: r.name,
            status: r.status,
            conclusion: r.conclusion,
            url: r.html_url,
            createdAt: r.created_at,
          })),
        };
      }

      case 'actions-trigger': {
        const owner = params.owner as string;
        const repo = params.repo as string;
        const workflowId = params.workflowId as string;
        const ref = (params.ref as string) ?? 'main';
        await ghJson(
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${encodeURIComponent(workflowId)}/dispatches`,
          token,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ref }),
          },
        );
        return { status: 'triggered', workflowId, ref };
      }

      // --- Repos ---
      case 'repos-list': {
        const type = (params.type as string) ?? 'all';
        const items = await ghJson<Array<{ name: string; full_name: string; private: boolean; default_branch: string }>>(
          `/user/repos?type=${encodeURIComponent(type)}`,
          token,
        );
        return {
          repositories: items.map(r => ({
            name: r.name,
            fullName: r.full_name,
            private: r.private,
            defaultBranch: r.default_branch,
          })),
        };
      }

      case 'repos-get': {
        const owner = params.owner as string;
        const repo = params.repo as string;
        const r = await ghJson<{ name: string; full_name: string; private: boolean; default_branch: string; description: string | null; stargazers_count: number; forks_count: number; html_url: string }>(
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
          token,
        );
        return {
          name: r.name,
          fullName: r.full_name,
          private: r.private,
          defaultBranch: r.default_branch,
          description: r.description,
          stars: r.stargazers_count,
          forks: r.forks_count,
          url: r.html_url,
        };
      }

      default:
        throw new Error(`Unknown action: ${actionId}`);
    }
  },

  async pollTrigger(_triggerId: string, _token: string, _lastPollAt?: number): Promise<TriggerEvent[]> {
    // Triggers require repository configuration (owner/repo) which is not available
    // in the pollTrigger signature. A future version could store monitored repos in
    // connector config. For now, return empty to avoid errors.
    return [];
  },
});
