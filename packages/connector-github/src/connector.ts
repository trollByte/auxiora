import { defineConnector } from '@auxiora/connectors';
import type { TriggerEvent } from '@auxiora/connectors';

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

  async executeAction(actionId: string, params: Record<string, unknown>, _token: string): Promise<unknown> {
    switch (actionId) {
      case 'issues-list':
        return { issues: [], owner: params.owner, repo: params.repo };
      case 'issues-create':
        return { issueNumber: Math.floor(Math.random() * 1000), status: 'created', title: params.title };
      case 'issues-update':
        return { issueNumber: params.issueNumber, status: 'updated' };
      case 'issues-comment':
        return { commentId: Math.floor(Math.random() * 10000), status: 'created' };
      case 'prs-list':
        return { pullRequests: [], owner: params.owner, repo: params.repo };
      case 'prs-create':
        return { pullNumber: Math.floor(Math.random() * 100), status: 'created', title: params.title };
      case 'prs-merge':
        return { pullNumber: params.pullNumber, status: 'merged' };
      case 'actions-list-runs':
        return { runs: [] };
      case 'actions-trigger':
        return { status: 'triggered', workflowId: params.workflowId };
      case 'repos-list':
        return { repositories: [] };
      case 'repos-get':
        return { owner: params.owner, repo: params.repo, defaultBranch: 'main' };
      default:
        throw new Error(`Unknown action: ${actionId}`);
    }
  },

  async pollTrigger(_triggerId: string, _token: string, _lastPollAt?: number): Promise<TriggerEvent[]> {
    return [];
  },
});
