import type { Tool, ToolParameter, ToolResult } from './index.js';
import { ToolPermission } from './index.js';
import { getLogger } from '@auxiora/logger';

const logger = getLogger('tools:contacts');

let contactGraph: any = null;
let contextRecall: any = null;

export function setContactGraph(graph: any): void {
  contactGraph = graph;
  logger.info('Contact graph connected to tools');
}

export function setContextRecall(recall: any): void {
  contextRecall = recall;
  logger.info('Context recall connected to tools');
}

export const WhoIsTool: Tool = {
  name: 'who_is',
  description: 'Look up a contact by name or email and get their profile, relationship history, and context. Call this when the user asks "who is [person]?" or needs context about someone before a meeting or email.',

  parameters: [
    {
      name: 'query',
      type: 'string',
      description: 'Name or email address to look up',
      required: true,
    },
  ] as ToolParameter[],

  getPermission(): ToolPermission {
    return ToolPermission.AUTO_APPROVE;
  },

  async execute(params: any): Promise<ToolResult> {
    try {
      if (!contextRecall) {
        return {
          success: true,
          output: JSON.stringify({
            message: 'Contacts not configured. Contact graph will be built from email and calendar data.',
          }),
        };
      }

      const info = contextRecall.whoIs(params.query);
      return {
        success: true,
        output: info,
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

export const ContactSearchTool: Tool = {
  name: 'contact_search',
  description: 'Search contacts by name, email, company, or tags. Call this when the user needs to find a contact or browse their contacts.',

  parameters: [
    {
      name: 'query',
      type: 'string',
      description: 'Search query — matches against name, email, company, and tags',
      required: true,
    },
    {
      name: 'limit',
      type: 'number',
      description: 'Maximum number of results',
      required: false,
      default: 10,
    },
  ] as ToolParameter[],

  getPermission(): ToolPermission {
    return ToolPermission.AUTO_APPROVE;
  },

  async execute(params: any): Promise<ToolResult> {
    try {
      if (!contactGraph) {
        return { success: false, error: 'Contact graph not initialized.' };
      }

      const results = contactGraph.search(params.query);
      const limited = results.slice(0, params.limit || 10);

      return {
        success: true,
        output: JSON.stringify({
          count: limited.length,
          contacts: limited.map((c: any) => ({
            id: c.id,
            displayName: c.displayName,
            emails: c.emails,
            company: c.company,
            jobTitle: c.jobTitle,
            relationship: c.relationship,
          })),
        }, null, 2),
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};
