import { describe, it, expect } from 'vitest';
import {
  EmailTriageTool,
  EmailReplyTool,
  EmailSearchTool,
  EmailComposeTool,
  EmailSummarizeTool,
  ToolPermission,
} from '../src/index.js';

describe('EmailTriageTool', () => {
  it('should have correct name and description', () => {
    expect(EmailTriageTool.name).toBe('email_triage');
    expect(EmailTriageTool.description).toContain('triage');
  });

  it('should have optional parameters with defaults', () => {
    const maxResults = EmailTriageTool.parameters.find(p => p.name === 'maxResults');
    expect(maxResults?.required).toBe(false);
    expect(maxResults?.default).toBe(20);
  });

  it('should auto-approve (read-only)', () => {
    expect(EmailTriageTool.getPermission({}, {} as any)).toBe(ToolPermission.AUTO_APPROVE);
  });

  it('should handle missing intelligence gracefully', async () => {
    const result = await EmailTriageTool.execute({}, {} as any);
    expect(result.success).toBe(true);
    expect(result.output).toContain('not configured');
  });
});

describe('EmailReplyTool', () => {
  it('should have correct name', () => {
    expect(EmailReplyTool.name).toBe('email_reply');
  });

  it('should require messageId and body', () => {
    const messageId = EmailReplyTool.parameters.find(p => p.name === 'messageId');
    const body = EmailReplyTool.parameters.find(p => p.name === 'body');
    expect(messageId?.required).toBe(true);
    expect(body?.required).toBe(true);
  });

  it('should require user approval when send=true', () => {
    expect(EmailReplyTool.getPermission({ send: true }, {} as any)).toBe(ToolPermission.USER_APPROVAL);
  });

  it('should auto-approve when send=false (draft)', () => {
    expect(EmailReplyTool.getPermission({ send: false }, {} as any)).toBe(ToolPermission.AUTO_APPROVE);
  });

  it('should auto-approve by default (no send param)', () => {
    expect(EmailReplyTool.getPermission({}, {} as any)).toBe(ToolPermission.AUTO_APPROVE);
  });
});

describe('EmailSearchTool', () => {
  it('should have correct name', () => {
    expect(EmailSearchTool.name).toBe('email_search');
  });

  it('should require query parameter', () => {
    const query = EmailSearchTool.parameters.find(p => p.name === 'query');
    expect(query?.required).toBe(true);
  });

  it('should always auto-approve (read-only)', () => {
    expect(EmailSearchTool.getPermission({}, {} as any)).toBe(ToolPermission.AUTO_APPROVE);
  });
});

describe('EmailComposeTool', () => {
  it('should have correct name', () => {
    expect(EmailComposeTool.name).toBe('email_compose');
  });

  it('should require to, subject, body', () => {
    const required = EmailComposeTool.parameters.filter(p => p.required).map(p => p.name);
    expect(required).toContain('to');
    expect(required).toContain('subject');
    expect(required).toContain('body');
  });

  it('should require user approval when send=true', () => {
    expect(EmailComposeTool.getPermission({ send: true }, {} as any)).toBe(ToolPermission.USER_APPROVAL);
  });

  it('should auto-approve when drafting', () => {
    expect(EmailComposeTool.getPermission({ send: false }, {} as any)).toBe(ToolPermission.AUTO_APPROVE);
  });
});

describe('EmailSummarizeTool', () => {
  it('should have correct name', () => {
    expect(EmailSummarizeTool.name).toBe('summarize_thread');
  });

  it('should require conversationId', () => {
    const param = EmailSummarizeTool.parameters.find(p => p.name === 'conversationId');
    expect(param?.required).toBe(true);
  });

  it('should auto-approve (read-only)', () => {
    expect(EmailSummarizeTool.getPermission({}, {} as any)).toBe(ToolPermission.AUTO_APPROVE);
  });
});
