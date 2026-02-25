import { describe, it, expect } from 'vitest';
import {
  SecurityFloor,
  SECURITY_TOOL_PATTERNS,
  SECURITY_MESSAGE_PATTERNS,
} from '../security-floor.js';
import type { ToneSettings } from '../types.js';

describe('SecurityFloor', () => {
  const sf = new SecurityFloor();

  describe('SECURITY_TOOL_PATTERNS', () => {
    it('should contain expected tool patterns', () => {
      expect(SECURITY_TOOL_PATTERNS).toContain('vault_read');
      expect(SECURITY_TOOL_PATTERNS).toContain('vault_write');
      expect(SECURITY_TOOL_PATTERNS).toContain('vault_delete');
      expect(SECURITY_TOOL_PATTERNS).toContain('secret_rotate');
      expect(SECURITY_TOOL_PATTERNS).toContain('credential_');
      expect(SECURITY_TOOL_PATTERNS).toContain('permission_change');
      expect(SECURITY_TOOL_PATTERNS).toContain('policy_update');
    });
  });

  describe('SECURITY_MESSAGE_PATTERNS', () => {
    it('should have 5 patterns', () => {
      expect(SECURITY_MESSAGE_PATTERNS).toHaveLength(5);
    });
  });

  describe('detectSecurityContext', () => {
    it('should detect vault_read tool call', () => {
      const ctx = sf.detectSecurityContext({
        toolCalls: ['vault_read'],
        userMessage: 'read my keys',
      });
      expect(ctx.active).toBe(true);
      expect(ctx.triggeredBy).toBe('tool');
    });

    it('should detect credential_ prefix in tool calls', () => {
      const ctx = sf.detectSecurityContext({
        toolCalls: ['credential_list'],
        userMessage: 'show credentials',
      });
      expect(ctx.active).toBe(true);
      expect(ctx.triggeredBy).toBe('tool');
    });

    it('should detect "delete my" in message', () => {
      const ctx = sf.detectSecurityContext({
        userMessage: 'Please delete my account data',
      });
      expect(ctx.active).toBe(true);
      expect(ctx.triggeredBy).toBe('message_pattern');
    });

    it('should detect "rotate" in message', () => {
      const ctx = sf.detectSecurityContext({
        userMessage: 'I need to rotate my API keys',
      });
      expect(ctx.active).toBe(true);
      expect(ctx.triggeredBy).toBe('message_pattern');
    });

    it('should detect "revoke" in message', () => {
      const ctx = sf.detectSecurityContext({
        userMessage: 'revoke the access token',
      });
      expect(ctx.active).toBe(true);
      expect(ctx.triggeredBy).toBe('message_pattern');
    });

    it('should detect "remove access" in message', () => {
      const ctx = sf.detectSecurityContext({
        userMessage: 'remove access for that user',
      });
      expect(ctx.active).toBe(true);
    });

    it('should detect "change password" in message', () => {
      const ctx = sf.detectSecurityContext({
        userMessage: 'I want to change password',
      });
      expect(ctx.active).toBe(true);
    });

    it('should detect active incident', () => {
      const ctx = sf.detectSecurityContext({
        userMessage: 'what happened?',
        activeIncident: true,
      });
      expect(ctx.active).toBe(true);
      expect(ctx.triggeredBy).toBe('incident');
      expect(ctx.activeRules).toContain('SF-3');
    });

    it('should detect trust flag', () => {
      const ctx = sf.detectSecurityContext({
        userMessage: 'do something',
        trustFlagged: true,
      });
      expect(ctx.active).toBe(true);
      expect(ctx.triggeredBy).toBe('trust_flag');
      expect(ctx.activeRules).toContain('SF-4');
    });

    it('should detect active workflow', () => {
      const ctx = sf.detectSecurityContext({
        userMessage: 'proceed',
        activeWorkflow: 'key-rotation',
      });
      expect(ctx.active).toBe(true);
      expect(ctx.triggeredBy).toBe('workflow');
    });

    it('should return inactive for normal messages', () => {
      const ctx = sf.detectSecurityContext({
        userMessage: 'What is the weather today?',
      });
      expect(ctx.active).toBe(false);
      expect(ctx.activeRules).toHaveLength(0);
    });

    it('should return inactive for normal messages without tool calls', () => {
      const ctx = sf.detectSecurityContext({
        userMessage: 'Help me write a function',
      });
      expect(ctx.active).toBe(false);
    });

    it('should prioritize incident over tool calls', () => {
      const ctx = sf.detectSecurityContext({
        toolCalls: ['vault_read'],
        userMessage: 'check',
        activeIncident: true,
      });
      expect(ctx.triggeredBy).toBe('incident');
    });

    it('should always include SF-5 when active', () => {
      const ctx = sf.detectSecurityContext({
        userMessage: 'rotate my keys',
      });
      expect(ctx.activeRules).toContain('SF-5');
    });
  });

  describe('applyFloor', () => {
    it('should clamp humor to 0', () => {
      const tone: ToneSettings = { warmth: 0.8, directness: 0.5, humor: 0.8, formality: 0.3 };
      const clamped = sf.applyFloor(tone);
      expect(clamped.humor).toBe(0);
    });

    it('should raise directness to at least 0.7', () => {
      const tone: ToneSettings = { warmth: 0.5, directness: 0.3, humor: 0.5, formality: 0.5 };
      const clamped = sf.applyFloor(tone);
      expect(clamped.directness).toBe(0.7);
    });

    it('should keep directness if already above 0.7', () => {
      const tone: ToneSettings = { warmth: 0.5, directness: 0.9, humor: 0.5, formality: 0.5 };
      const clamped = sf.applyFloor(tone);
      expect(clamped.directness).toBe(0.9);
    });

    it('should raise formality to at least 0.5', () => {
      const tone: ToneSettings = { warmth: 0.5, directness: 0.5, humor: 0.5, formality: 0.2 };
      const clamped = sf.applyFloor(tone);
      expect(clamped.formality).toBe(0.5);
    });

    it('should preserve warmth', () => {
      const tone: ToneSettings = { warmth: 0.9, directness: 0.8, humor: 0.6, formality: 0.7 };
      const clamped = sf.applyFloor(tone);
      expect(clamped.warmth).toBe(0.9);
    });
  });

  describe('getSecurityPromptSection', () => {
    it('should return empty string for inactive context', () => {
      const section = sf.getSecurityPromptSection({
        active: false,
        triggeredBy: 'message_pattern',
        activeRules: [],
      });
      expect(section).toBe('');
    });

    it('should include header and rules for active context', () => {
      const section = sf.getSecurityPromptSection({
        active: true,
        triggeredBy: 'tool',
        activeRules: ['SF-1', 'SF-2', 'SF-5'],
      });
      expect(section).toContain('## Security Floor Active');
      expect(section).toContain('SF-1');
      expect(section).toContain('SF-2');
      expect(section).toContain('SF-5');
      expect(section).toContain('CREDENTIAL_HANDLING');
    });

    it('should include trigger information', () => {
      const section = sf.getSecurityPromptSection({
        active: true,
        triggeredBy: 'incident',
        activeRules: ['SF-3'],
      });
      expect(section).toContain('Triggered by: incident');
    });
  });
});
