import type { Tool, ToolParameter, ExecutionContext, ToolResult } from './index.js';
import { ToolPermission } from './index.js';
import { getLogger } from '@auxiora/logger';

const logger = getLogger('tools:email');

let emailIntelligence: any = null;
let emailConnectors: any = null;

export function setEmailIntelligence(engine: any): void {
  emailIntelligence = engine;
  logger.info('Email intelligence connected to tools');
}

export function setEmailConnectors(connectors: any): void {
  emailConnectors = connectors;
  logger.info('Email connectors connected to tools');
}

export const EmailTriageTool: Tool = {
  name: 'email_triage',
  description: 'Show a prioritized email summary with triage categories (urgent, action needed, FYI, spam). Call this when the user asks about their email, inbox, or what needs attention.',

  parameters: [
    {
      name: 'maxResults',
      type: 'number',
      description: 'Maximum number of emails to triage',
      required: false,
      default: 20,
    },
    {
      name: 'source',
      type: 'string',
      description: 'Email source to triage: "google", "microsoft", or "all"',
      required: false,
      default: 'all',
    },
  ] as ToolParameter[],

  getPermission(): ToolPermission {
    return ToolPermission.AUTO_APPROVE;
  },

  async execute(params: any): Promise<ToolResult> {
    try {
      const maxResults = params.maxResults || 20;
      const source = params.source || 'all';

      if (!emailIntelligence) {
        return {
          success: true,
          output: JSON.stringify({
            message: 'Email intelligence not configured. Connect a Google or Microsoft account first.',
            setup: 'Use /connect google-workspace or /connect microsoft-365',
          }),
        };
      }

      const triage = emailIntelligence.triage;
      if (!triage) {
        return { success: false, error: 'Email triage engine not available' };
      }

      const results = await triage.getTriageSummary({ maxResults, source });
      return {
        success: true,
        output: JSON.stringify(results, null, 2),
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

export const EmailReplyTool: Tool = {
  name: 'email_reply',
  description: 'Draft or send a reply to an email. By default creates a draft; set send=true to send immediately. Call this when the user wants to respond to an email.',

  parameters: [
    {
      name: 'messageId',
      type: 'string',
      description: 'ID of the email to reply to',
      required: true,
    },
    {
      name: 'body',
      type: 'string',
      description: 'Reply body content',
      required: true,
    },
    {
      name: 'send',
      type: 'boolean',
      description: 'Whether to send immediately (true) or save as draft (false)',
      required: false,
      default: false,
    },
    {
      name: 'replyAll',
      type: 'boolean',
      description: 'Whether to reply to all recipients',
      required: false,
      default: false,
    },
  ] as ToolParameter[],

  getPermission(params: any): ToolPermission {
    return params.send ? ToolPermission.USER_APPROVAL : ToolPermission.AUTO_APPROVE;
  },

  async execute(params: any): Promise<ToolResult> {
    try {
      if (!emailConnectors) {
        return { success: false, error: 'No email accounts connected. Use /connect to add one.' };
      }

      const action = params.send ? 'mail-reply' : 'mail-draft';
      const result = await emailConnectors.execute(action, {
        messageId: params.messageId,
        body: params.body,
        replyAll: params.replyAll || false,
      });

      return {
        success: true,
        output: JSON.stringify({
          action: params.send ? 'sent' : 'drafted',
          messageId: params.messageId,
          ...result,
        }),
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

export const EmailSearchTool: Tool = {
  name: 'email_search',
  description: 'Search emails across all connected accounts. Call this when the user asks to find specific emails, threads, or messages.',

  parameters: [
    {
      name: 'query',
      type: 'string',
      description: 'Search query (e.g., "from:john budget report", "meeting notes last week")',
      required: true,
    },
    {
      name: 'maxResults',
      type: 'number',
      description: 'Maximum number of results',
      required: false,
      default: 10,
    },
    {
      name: 'source',
      type: 'string',
      description: 'Search in "google", "microsoft", or "all" accounts',
      required: false,
      default: 'all',
    },
  ] as ToolParameter[],

  getPermission(): ToolPermission {
    return ToolPermission.AUTO_APPROVE;
  },

  async execute(params: any): Promise<ToolResult> {
    try {
      if (!emailConnectors) {
        return { success: false, error: 'No email accounts connected. Use /connect to add one.' };
      }

      const result = await emailConnectors.execute('mail-search', {
        query: params.query,
        maxResults: params.maxResults || 10,
      });

      return {
        success: true,
        output: JSON.stringify(result, null, 2),
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

export const EmailComposeTool: Tool = {
  name: 'email_compose',
  description: 'Compose and optionally send a new email. By default creates a draft; set send=true to send immediately. Call this when the user wants to write a new email.',

  parameters: [
    {
      name: 'to',
      type: 'string',
      description: 'Recipient email address(es), comma-separated',
      required: true,
    },
    {
      name: 'subject',
      type: 'string',
      description: 'Email subject line',
      required: true,
    },
    {
      name: 'body',
      type: 'string',
      description: 'Email body content',
      required: true,
    },
    {
      name: 'cc',
      type: 'string',
      description: 'CC recipients, comma-separated',
      required: false,
    },
    {
      name: 'bcc',
      type: 'string',
      description: 'BCC recipients, comma-separated',
      required: false,
    },
    {
      name: 'send',
      type: 'boolean',
      description: 'Whether to send immediately (true) or save as draft (false)',
      required: false,
      default: false,
    },
  ] as ToolParameter[],

  getPermission(params: any): ToolPermission {
    return params.send ? ToolPermission.USER_APPROVAL : ToolPermission.AUTO_APPROVE;
  },

  async execute(params: any): Promise<ToolResult> {
    try {
      if (!emailConnectors) {
        return { success: false, error: 'No email accounts connected. Use /connect to add one.' };
      }

      const action = params.send ? 'mail-send' : 'mail-draft';
      const result = await emailConnectors.execute(action, {
        to: params.to,
        subject: params.subject,
        body: params.body,
        cc: params.cc,
        bcc: params.bcc,
      });

      return {
        success: true,
        output: JSON.stringify({
          action: params.send ? 'sent' : 'drafted',
          to: params.to,
          subject: params.subject,
          ...result,
        }),
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

export const EmailSummarizeTool: Tool = {
  name: 'summarize_thread',
  description: 'Summarize an email thread into key points and action items. Call this when the user wants a quick overview of a long email chain.',

  parameters: [
    {
      name: 'conversationId',
      type: 'string',
      description: 'Conversation/thread ID to summarize',
      required: true,
    },
  ] as ToolParameter[],

  getPermission(): ToolPermission {
    return ToolPermission.AUTO_APPROVE;
  },

  async execute(params: any): Promise<ToolResult> {
    try {
      if (!emailIntelligence) {
        return { success: false, error: 'Email intelligence not configured.' };
      }

      const summarizer = emailIntelligence.summarizer;
      if (!summarizer) {
        return { success: false, error: 'Thread summarizer not available' };
      }

      const summary = await summarizer.summarizeThread(params.conversationId);
      return {
        success: true,
        output: JSON.stringify(summary, null, 2),
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};
