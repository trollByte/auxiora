import { describe, it, expect } from 'vitest';
import {
  PostSocialTool,
  CheckMentionsTool,
  SchedulePostTool,
  ToolPermission,
  setSocialConnectors,
} from '../src/index.js';

describe('PostSocialTool', () => {
  it('should have correct name', () => {
    expect(PostSocialTool.name).toBe('post_social');
  });

  it('should require platform and content', () => {
    const required = PostSocialTool.parameters.filter(p => p.required).map(p => p.name);
    expect(required).toContain('platform');
    expect(required).toContain('content');
  });

  it('should always require user approval (posts publicly)', () => {
    expect(PostSocialTool.getPermission({}, {} as any)).toBe(ToolPermission.USER_APPROVAL);
  });

  it('should fail without connectors', async () => {
    setSocialConnectors(null);
    const result = await PostSocialTool.execute({ platform: 'twitter', content: 'hello' }, {} as any);
    expect(result.success).toBe(false);
    expect(result.error).toContain('No social accounts');
  });

  it('should reject unsupported platforms', async () => {
    setSocialConnectors({ execute: async () => ({}) });
    const result = await PostSocialTool.execute({ platform: 'tiktok', content: 'hello' }, {} as any);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unsupported platform');
  });

  it('should post to twitter', async () => {
    setSocialConnectors({
      execute: async (action: string, params: any) => ({ tweetId: '123' }),
    });
    const result = await PostSocialTool.execute({ platform: 'twitter', content: 'Test tweet' }, {} as any);
    expect(result.success).toBe(true);
    const parsed = JSON.parse(result.output!);
    expect(parsed.posted).toBe(true);
    expect(parsed.platform).toBe('twitter');
  });
});

describe('CheckMentionsTool', () => {
  it('should have correct name', () => {
    expect(CheckMentionsTool.name).toBe('check_mentions');
  });

  it('should auto-approve (read-only)', () => {
    expect(CheckMentionsTool.getPermission({}, {} as any)).toBe(ToolPermission.AUTO_APPROVE);
  });

  it('should have optional platform parameter defaulting to all', () => {
    const platform = CheckMentionsTool.parameters.find(p => p.name === 'platform');
    expect(platform?.required).toBe(false);
    expect(platform?.default).toBe('all');
  });

  it('should fail without connectors', async () => {
    setSocialConnectors(null);
    const result = await CheckMentionsTool.execute({}, {} as any);
    expect(result.success).toBe(false);
    expect(result.error).toContain('No social accounts');
  });

  it('should check mentions across platforms', async () => {
    setSocialConnectors({
      execute: async (action: string) => ({ mentions: [] }),
    });
    const result = await CheckMentionsTool.execute({ platform: 'all' }, {} as any);
    expect(result.success).toBe(true);
    const parsed = JSON.parse(result.output!);
    expect(parsed).toHaveProperty('twitter');
    expect(parsed).toHaveProperty('linkedin');
    expect(parsed).toHaveProperty('reddit');
  });
});

describe('SchedulePostTool', () => {
  it('should have correct name', () => {
    expect(SchedulePostTool.name).toBe('schedule_post');
  });

  it('should require platform, content, and scheduledAt', () => {
    const required = SchedulePostTool.parameters.filter(p => p.required).map(p => p.name);
    expect(required).toContain('platform');
    expect(required).toContain('content');
    expect(required).toContain('scheduledAt');
  });

  it('should require user approval', () => {
    expect(SchedulePostTool.getPermission({}, {} as any)).toBe(ToolPermission.USER_APPROVAL);
  });

  it('should fail without connectors', async () => {
    setSocialConnectors(null);
    const result = await SchedulePostTool.execute({
      platform: 'twitter',
      content: 'test',
      scheduledAt: '2030-01-01T00:00:00Z',
    }, {} as any);
    expect(result.success).toBe(false);
  });

  it('should reject invalid dates', async () => {
    setSocialConnectors({ execute: async () => ({}) });
    const result = await SchedulePostTool.execute({
      platform: 'twitter',
      content: 'test',
      scheduledAt: 'not-a-date',
    }, {} as any);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid');
  });

  it('should reject past dates', async () => {
    setSocialConnectors({ execute: async () => ({}) });
    const result = await SchedulePostTool.execute({
      platform: 'twitter',
      content: 'test',
      scheduledAt: '2020-01-01T00:00:00Z',
    }, {} as any);
    expect(result.success).toBe(false);
    expect(result.error).toContain('future');
  });

  it('should schedule a future post', async () => {
    setSocialConnectors({ execute: async () => ({}) });
    const result = await SchedulePostTool.execute({
      platform: 'twitter',
      content: 'Future post',
      scheduledAt: '2030-06-15T14:00:00Z',
    }, {} as any);
    expect(result.success).toBe(true);
    const parsed = JSON.parse(result.output!);
    expect(parsed.scheduled).toBe(true);
  });
});
