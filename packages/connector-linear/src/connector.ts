import { defineConnector } from '@auxiora/connectors';
import type { TriggerEvent } from '@auxiora/connectors';

async function linearQuery(token: string, query: string, variables?: Record<string, unknown>) {
  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Linear API error: ${res.status} ${res.statusText}`);
  const json = await res.json() as { data?: Record<string, unknown>; errors?: Array<{ message: string }> };
  if (json.errors?.length) throw new Error(`Linear GraphQL error: ${json.errors[0].message}`);
  return json.data!;
}

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

  async executeAction(actionId: string, params: Record<string, unknown>, token: string): Promise<unknown> {
    switch (actionId) {
      case 'issues-list': {
        const filters: string[] = [];
        if (params.teamId) filters.push(`team: { id: { eq: "${params.teamId}" } }`);
        if (params.state) filters.push(`state: { name: { eq: "${params.state}" } }`);
        if (params.assigneeId) filters.push(`assignee: { id: { eq: "${params.assigneeId}" } }`);
        const filterClause = filters.length > 0 ? `filter: { ${filters.join(', ')} }, ` : '';
        const first = (params.maxResults as number) || 20;
        const data = await linearQuery(token, `query { issues(${filterClause}first: ${first}) { nodes { id identifier title state { name } priority assignee { name } createdAt updatedAt } } }`);
        return data.issues;
      }
      case 'issues-get': {
        const data = await linearQuery(token, `query($issueId: String!) { issue(id: $issueId) { id identifier title description state { name } priority assignee { name } createdAt updatedAt labels { nodes { name } } } }`, { issueId: params.issueId });
        return data.issue;
      }
      case 'issues-create': {
        const input: Record<string, unknown> = {
          teamId: params.teamId,
          title: params.title,
        };
        if (params.description !== undefined) input.description = params.description;
        if (params.priority !== undefined) input.priority = params.priority;
        if (params.assigneeId !== undefined) input.assigneeId = params.assigneeId;
        if (params.labelIds !== undefined) input.labelIds = params.labelIds;
        const data = await linearQuery(token, `mutation($input: IssueCreateInput!) { issueCreate(input: $input) { issue { id identifier title } success } }`, { input });
        return data.issueCreate;
      }
      case 'issues-update': {
        const input: Record<string, unknown> = {};
        if (params.title !== undefined) input.title = params.title;
        if (params.description !== undefined) input.description = params.description;
        if (params.stateId !== undefined) input.stateId = params.stateId;
        if (params.priority !== undefined) input.priority = params.priority;
        const data = await linearQuery(token, `mutation($issueId: String!, $input: IssueUpdateInput!) { issueUpdate(id: $issueId, input: $input) { issue { id identifier title state { name } } success } }`, { issueId: params.issueId, input });
        return data.issueUpdate;
      }
      case 'issues-comment': {
        const data = await linearQuery(token, `mutation($input: CommentCreateInput!) { commentCreate(input: $input) { comment { id body createdAt } success } }`, { input: { issueId: params.issueId, body: params.body } });
        return data.commentCreate;
      }
      case 'projects-list': {
        const data = await linearQuery(token, `query { projects(first: 50) { nodes { id name state progress } } }`);
        return data.projects;
      }
      case 'projects-get': {
        const data = await linearQuery(token, `query($projectId: String!) { project(id: $projectId) { id name description state progress startDate targetDate } }`, { projectId: params.projectId });
        return data.project;
      }
      case 'cycles-list': {
        const data = await linearQuery(token, `query($teamId: String!) { team(id: $teamId) { cycles(first: 20) { nodes { id name number startsAt endsAt progress } } } }`, { teamId: params.teamId });
        return (data.team as Record<string, unknown>).cycles;
      }
      case 'cycles-current': {
        const data = await linearQuery(token, `query($teamId: String!) { team(id: $teamId) { activeCycle { id name number startsAt endsAt progress } } }`, { teamId: params.teamId });
        return (data.team as Record<string, unknown>).activeCycle;
      }
      default:
        throw new Error(`Unknown action: ${actionId}`);
    }
  },

  async pollTrigger(triggerId: string, token: string, lastPollAt?: number): Promise<TriggerEvent[]> {
    const since = lastPollAt ? new Date(lastPollAt).toISOString() : new Date(Date.now() - 60_000).toISOString();

    if (triggerId === 'issue-created') {
      const data = await linearQuery(token, `query($since: DateTime!) { issues(filter: { createdAt: { gte: $since } }, first: 50) { nodes { id identifier title state { name } priority createdAt } } }`, { since });
      const issues = data.issues as { nodes: Array<Record<string, unknown>> };
      return issues.nodes.map(issue => ({
        triggerId: 'issue-created',
        connectorId: 'linear',
        data: issue,
        timestamp: new Date(issue.createdAt as string).getTime(),
      }));
    }

    if (triggerId === 'status-changed') {
      const data = await linearQuery(token, `query($since: DateTime!) { issues(filter: { updatedAt: { gte: $since } }, first: 50) { nodes { id identifier title state { name } priority updatedAt } } }`, { since });
      const issues = data.issues as { nodes: Array<Record<string, unknown>> };
      return issues.nodes.map(issue => ({
        triggerId: 'status-changed',
        connectorId: 'linear',
        data: issue,
        timestamp: new Date(issue.updatedAt as string).getTime(),
      }));
    }

    return [];
  },
});
