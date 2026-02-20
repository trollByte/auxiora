import { describe, it, expect } from 'vitest';
import { OutputFilter } from '../src/output-filter.js';

describe('OutputFilter', () => {
  const filter = new OutputFilter();

  describe('scan', () => {
    it('detects OpenAI API keys', () => {
      const findings = filter.scan('Key: sk-abcdefghijklmnopqrstuvwx');
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].type).toBe('data_leak');
      expect(findings[0].severity).toBe('critical');
    });

    it('detects GitHub tokens', () => {
      const findings = filter.scan('Token: ghp_abcdefghijklmnopqrstuvwx');
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].severity).toBe('critical');
    });

    it('detects AWS access keys', () => {
      const findings = filter.scan('Key: AKIAIOSFODNN7EXAMPLE');
      expect(findings.length).toBeGreaterThan(0);
    });

    it('detects Bearer tokens', () => {
      const findings = filter.scan('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.test');
      expect(findings.length).toBeGreaterThan(0);
    });

    it('detects internal file paths', () => {
      const findings = filter.scan('Config at /home/user/app/config.json');
      expect(findings.length).toBeGreaterThan(0);
    });

    it('detects stack traces', () => {
      const findings = filter.scan('at Module.load (internal/modules/cjs/loader.js:878:14)');
      expect(findings.length).toBeGreaterThan(0);
    });

    it('detects environment variables', () => {
      expect(filter.scan('process.env.DATABASE_URL').length).toBeGreaterThan(0);
    });

    it('detects dangerous commands', () => {
      const findings = filter.scan('Run: rm -rf / to fix it');
      expect(findings.length).toBeGreaterThan(0);
    });

    it('detects DROP TABLE', () => {
      expect(filter.scan('Try: DROP TABLE users;').length).toBeGreaterThan(0);
    });

    it('returns empty for safe text', () => {
      expect(filter.scan('The weather is nice today.')).toHaveLength(0);
    });
  });

  describe('filter', () => {
    it('redacts API keys', () => {
      const result = filter.filter('Key: sk-abcdefghijklmnopqrstuvwx');
      expect(result).toContain('[REDACTED_KEY]');
      expect(result).not.toContain('sk-abcdefghijklmnopqrstuvwx');
    });

    it('redacts GitHub tokens', () => {
      expect(filter.filter('Token: ghp_abcdefghijklmnopqrstuvwx')).toContain('[REDACTED_TOKEN]');
    });

    it('preserves safe text', () => {
      expect(filter.filter('Everything is fine.')).toBe('Everything is fine.');
    });
  });
});
