import { defineConnector } from '@auxiora/connectors';
import type { TriggerEvent } from '@auxiora/connectors';

export const linearConnector = defineConnector({
  id: 'linear',
  name: 'Linear',
  description: 'Integration with Linear for issue tracking, projects, and cycles',
  version: '1.0.0',
  category: 'devtools',
  icon: 'linear',

  auth: {
    type: 'oauth2',
    oauth2: {
      authUrl: 'https://linear.app/oauth/authorize',
      tokenUrl: 'https://api.linear.app/oauth/token',
      scopes: ['read', 'write', 'issues:create'],
    },
    instructions: 'You can also use a Linear API key with api_key auth type.',
  },

  actions: [
    // --- Issues ---
    {
      id: 'issues-list',
      name: 'List Issues',
      description: 'List issues from Linear',
      trustMinimum: 1,
      trustDomain: 'integrations',
      reversible: false,
      sideEffects: false,
      params: {
        teamId: { type: 'string', description: 'Team ID' },
        state: { type: 'string', description: 'Issue state filter' },
        assigneeId: { type: 'string', description: 'Filter by assignee' },
        maxResults: { type: 'number', description: 'Max results', default: 20 },
      },
    },
    {
      id: 'issues-get',
      name: 'Get Issue',
      description: 'Get a specific Linear issue',
      trustMinimum: 1,
      trustDomain: 'integrations',
      reversible: false,
      sideEffects: false,
      params: {
        issueId: { type: 'string', description: 'Issue ID', required: true },
      },
    },
    {
      id: 'issues-create',
      name: 'Create Issue',
      description: 'Create a new Linear issue',
      trustMinimum: 2,
      trustDomain: 'integrations',
      reversible: true,
      sideEffects: true,
      params: {
        teamId: { type: 'string', description: 'Team ID', required: true },
        title: { type: 'string', description: 'Issue title', required: true },
        description: { type: 'string', description: 'Issue description' },
        priority: { type: 'number', description: 'Priority (0-4)' },
        assigneeId: { type: 'string', description: 'Assignee ID' },
        labelIds: { type: 'array', description: 'Label IDs' },
      },
    },
    {
      id: 'issues-update',
      name: 'Update Issue',
      description: 'Update a Linear issue',
      trustMinimum: 2,
      trustDomain: 'integrations',
      reversible: true,
      sideEffects: true,
      params: {
        issueId: { type: 'string', description: 'Issue ID', required: true },
        title: { type: 'string', description: 'Updated title' },
        description: { type: 'string', description: 'Updated description' },
        stateId: { type: 'string', description: 'New state ID' },
        priority: { type: 'number', description: 'Updated priority' },
      },
    },
    {
      id: 'issues-comment',
      name: 'Comment on Issue',
      description: 'Add a comment to a Linear issue',
      trustMinimum: 2,
      trustDomain: 'integrations',
      reversible: true,
      sideEffects: true,
      params: {
        issueId: { type: 'string', description: 'Issue ID', required: true },
        body: { type: 'string', description: 'Comment body', required: true },
      },
    },
    // --- Projects ---
    {
      id: 'projects-list',
      name: 'List Projects',
      description: 'List projects in Linear',
      trustMinimum: 1,
      trustDomain: 'integrations',
      reversible: false,
      sideEffects: false,
      params: {},
    },
    {
      id: 'projects-get',
      name: 'Get Project',
      description: 'Get a specific project',
      trustMinimum: 1,
      trustDomain: 'integrations',
      reversible: false,
      sideEffects: false,
      params: {
        projectId: { type: 'string', description: 'Project ID', required: true },
      },
    },
    // --- Cycles ---
    {
      id: 'cycles-list',
      name: 'List Cycles',
      description: 'List cycles in a team',
      trustMinimum: 1,
      trustDomain: 'integrations',
      reversible: false,
      sideEffects: false,
      params: {
        teamId: { type: 'string', description: 'Team ID', required: true },
      },
    },
    {
      id: 'cycles-current',
      name: 'Get Current Cycle',
      description: 'Get the current active cycle',
      trustMinimum: 1,
      trustDomain: 'integrations',
      reversible: false,
      sideEffects: false,
      params: {
        teamId: { type: 'string', description: 'Team ID', required: true },
      },
    },
  ],

  triggers: [
    {
      id: 'issue-created',
      name: 'Issue Created',
      description: 'Triggered when a new issue is created',
      type: 'poll',
      pollIntervalMs: 60_000,
    },
    {
      id: 'status-changed',
      name: 'Issue Status Changed',
      description: 'Triggered when an issue status changes',
      type: 'poll',
      pollIntervalMs: 60_000,
    },
  ],

  entities: [
    {
      id: 'issue',
      name: 'Issue',
      description: 'A Linear issue',
      fields: { id: 'string', identifier: 'string', title: 'string', state: 'string', priority: 'number' },
    },
    {
      id: 'project',
      name: 'Project',
      description: 'A Linear project',
      fields: { id: 'string', name: 'string', state: 'string', progress: 'number' },
    },
    {
      id: 'cycle',
      name: 'Cycle',
      description: 'A Linear cycle',
      fields: { id: 'string', name: 'string', startsAt: 'string', endsAt: 'string', progress: 'number' },
    },
  ],

  async executeAction(actionId: string, params: Record<string, unknown>, _token: string): Promise<unknown> {
    switch (actionId) {
      case 'issues-list':
        return { issues: [] };
      case 'issues-get':
        return { issueId: params.issueId, title: '', state: 'todo' };
      case 'issues-create':
        return { issueId: `issue_${Date.now()}`, status: 'created', title: params.title };
      case 'issues-update':
        return { issueId: params.issueId, status: 'updated' };
      case 'issues-comment':
        return { commentId: `comment_${Date.now()}`, status: 'created' };
      case 'projects-list':
        return { projects: [] };
      case 'projects-get':
        return { projectId: params.projectId, name: '', state: 'active' };
      case 'cycles-list':
        return { cycles: [] };
      case 'cycles-current':
        return { cycle: null, teamId: params.teamId };
      default:
        throw new Error(`Unknown action: ${actionId}`);
    }
  },

  async pollTrigger(_triggerId: string, _token: string, _lastPollAt?: number): Promise<TriggerEvent[]> {
    return [];
  },
});
