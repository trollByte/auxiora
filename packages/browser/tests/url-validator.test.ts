import { describe, it, expect } from 'vitest';
import { validateUrl } from '../src/url-validator.js';

describe('URL Validator', () => {
  describe('valid URLs', () => {
    it('should allow https URLs', () => {
      expect(validateUrl('https://example.com')).toBeNull();
    });

    it('should allow http URLs', () => {
      expect(validateUrl('http://example.com')).toBeNull();
    });

    it('should allow URLs with paths', () => {
      expect(validateUrl('https://example.com/path/to/page')).toBeNull();
    });

    it('should allow URLs with query params', () => {
      expect(validateUrl('https://example.com?q=search&page=1')).toBeNull();
    });
  });

  describe('blocked protocols', () => {
    it('should block file:// protocol', () => {
      const error = validateUrl('file:///etc/passwd');
      expect(error).toContain('protocol');
    });

    it('should block javascript: protocol', () => {
      const error = validateUrl('javascript:alert(1)');
      expect(error).toContain('protocol');
    });

    it('should block data: protocol', () => {
      const error = validateUrl('data:text/html,<script>alert(1)</script>');
      expect(error).toContain('protocol');
    });
  });

  describe('private IP blocking', () => {
    it('should block localhost', () => {
      const error = validateUrl('http://localhost:3000');
      expect(error).toContain('private');
    });

    it('should block 127.0.0.1', () => {
      const error = validateUrl('http://127.0.0.1');
      expect(error).toContain('private');
    });

    it('should block 10.x.x.x', () => {
      const error = validateUrl('http://10.0.0.1');
      expect(error).toContain('private');
    });

    it('should block 192.168.x.x', () => {
      const error = validateUrl('http://192.168.1.1');
      expect(error).toContain('private');
    });

    it('should block 169.254.x.x (link-local)', () => {
      const error = validateUrl('http://169.254.169.254');
      expect(error).toContain('private');
    });

    it('should block 172.16-31.x.x', () => {
      const error = validateUrl('http://172.16.0.1');
      expect(error).toContain('private');
    });
  });

  describe('invalid URLs', () => {
    it('should reject empty string', () => {
      const error = validateUrl('');
      expect(error).toBeTruthy();
    });

    it('should reject malformed URLs', () => {
      const error = validateUrl('not a url');
      expect(error).toBeTruthy();
    });
  });

  describe('allowlist/blocklist', () => {
    it('should allow private IPs when in allowlist', () => {
      const error = validateUrl('http://localhost:3000', {
        allowedUrls: ['localhost'],
      });
      expect(error).toBeNull();
    });

    it('should block URLs in blocklist', () => {
      const error = validateUrl('https://evil.com/page', {
        blockedUrls: ['evil.com'],
      });
      expect(error).toContain('blocked');
    });
  });
});
