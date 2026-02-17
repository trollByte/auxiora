import { describe, it, expect } from 'vitest';
import { validateUrl } from '../src/validate.js';

describe('validateUrl', () => {
  describe('valid URLs', () => {
    it('should allow https URLs', () => {
      expect(validateUrl('https://example.com')).toBeNull();
    });
    it('should allow http URLs', () => {
      expect(validateUrl('http://example.com')).toBeNull();
    });
    it('should allow URLs with paths and query params', () => {
      expect(validateUrl('https://example.com/path?q=1')).toBeNull();
    });
  });

  describe('blocked protocols', () => {
    it('should block file:// protocol', () => {
      expect(validateUrl('file:///etc/passwd')).toContain('protocol');
    });
    it('should block javascript: protocol', () => {
      expect(validateUrl('javascript:alert(1)')).toContain('protocol');
    });
    it('should block data: protocol', () => {
      expect(validateUrl('data:text/html,<script>alert(1)</script>')).toContain('protocol');
    });
  });

  describe('private IP blocking', () => {
    it('should block localhost', () => {
      expect(validateUrl('http://localhost:3000')).toContain('private');
    });
    it('should block 127.0.0.1', () => {
      expect(validateUrl('http://127.0.0.1')).toContain('private');
    });
    it('should block 10.x.x.x', () => {
      expect(validateUrl('http://10.0.0.1')).toContain('private');
    });
    it('should block 192.168.x.x', () => {
      expect(validateUrl('http://192.168.1.1')).toContain('private');
    });
    it('should block 169.254.x.x (cloud metadata)', () => {
      expect(validateUrl('http://169.254.169.254')).toContain('private');
    });
    it('should block 172.16-31.x.x', () => {
      expect(validateUrl('http://172.16.0.1')).toContain('private');
      expect(validateUrl('http://172.31.255.255')).toContain('private');
    });
    it('should allow 172.32.x.x (not private)', () => {
      expect(validateUrl('http://172.32.0.1')).toBeNull();
    });
    it('should block 0.0.0.0', () => {
      expect(validateUrl('http://0.0.0.0')).toContain('private');
    });
  });

  describe('SSRF bypass prevention', () => {
    it('should block decimal IP encoding (2130706433 = 127.0.0.1)', () => {
      expect(validateUrl('http://2130706433')).toBeTruthy();
    });
    it('should block hex IP encoding (0x7f000001 = 127.0.0.1)', () => {
      expect(validateUrl('http://0x7f000001')).toBeTruthy();
    });
    it('should block IPv6 loopback (::1)', () => {
      expect(validateUrl('http://[::1]')).toContain('private');
    });
    it('should block IPv6-mapped 127.0.0.1', () => {
      expect(validateUrl('http://[::ffff:127.0.0.1]')).toContain('private');
    });
    it('should block subdomain of localhost', () => {
      expect(validateUrl('http://foo.localhost:3000')).toContain('private');
    });
  });

  describe('invalid input', () => {
    it('should reject empty string', () => {
      expect(validateUrl('')).toBeTruthy();
    });
    it('should reject malformed URLs', () => {
      expect(validateUrl('not a url')).toBeTruthy();
    });
  });

  describe('allowlist/blocklist', () => {
    it('should allow private IPs when in allowlist', () => {
      expect(validateUrl('http://localhost:3000', { allowedUrls: ['localhost'] })).toBeNull();
    });
    it('should block URLs in blocklist', () => {
      expect(validateUrl('https://evil.com/page', { blockedUrls: ['evil.com'] })).toContain('blocked');
    });
    it('should let blocklist take priority over allowlist', () => {
      expect(validateUrl('https://evil.com', {
        allowedUrls: ['evil.com'],
        blockedUrls: ['evil.com'],
      })).toContain('blocked');
    });
  });
});
