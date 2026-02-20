import { describe, it, expect } from 'vitest';
import { PiiDetector } from '../src/pii-detector.js';

describe('PiiDetector', () => {
  const detector = new PiiDetector();

  describe('scan', () => {
    it('detects email addresses', () => {
      const findings = detector.scan('Contact me at user@example.com please');
      expect(findings).toHaveLength(1);
      expect(findings[0].type).toBe('pii');
      expect(findings[0].severity).toBe('medium');
      expect(findings[0].redacted).toBe('[EMAIL]');
    });

    it('detects multiple emails', () => {
      const findings = detector.scan('Email a@b.com or c@d.org');
      expect(findings.filter((f) => f.redacted === '[EMAIL]')).toHaveLength(2);
    });

    it('detects SSN patterns', () => {
      const findings = detector.scan('My SSN is 123-45-6789');
      const ssn = findings.find((f) => f.redacted === '[SSN]');
      expect(ssn).toBeDefined();
      expect(ssn!.severity).toBe('high');
    });

    it('detects credit card numbers', () => {
      const findings = detector.scan('Card: 4111 1111 1111 1111');
      const cc = findings.find((f) => f.redacted === '[CARD]');
      expect(cc).toBeDefined();
      expect(cc!.severity).toBe('high');
    });

    it('detects phone numbers', () => {
      const findings = detector.scan('Call me at (555) 123-4567');
      expect(findings.find((f) => f.redacted === '[PHONE]')).toBeDefined();
    });

    it('detects international phone numbers', () => {
      const findings = detector.scan('Phone: +1-555-123-4567');
      expect(findings.find((f) => f.redacted === '[PHONE]')).toBeDefined();
    });

    it('detects IP addresses', () => {
      const findings = detector.scan('Server at 192.168.1.100');
      const ip = findings.find((f) => f.redacted === '[IP]');
      expect(ip).toBeDefined();
      expect(ip!.severity).toBe('medium');
    });

    it('detects date of birth with DOB prefix', () => {
      const findings = detector.scan('DOB: 01/15/1990');
      expect(findings.find((f) => f.redacted === '[DOB]')).toBeDefined();
    });

    it('detects date of birth with born on prefix', () => {
      const findings = detector.scan('born on 01/15/1990');
      expect(findings.find((f) => f.redacted === '[DOB]')).toBeDefined();
    });

    it('stores offset and length', () => {
      const findings = detector.scan('Email: user@example.com');
      const email = findings.find((f) => f.redacted === '[EMAIL]');
      expect(email!.offset).toBe(7);
      expect(email!.length).toBe(16);
    });

    it('returns empty array for clean text', () => {
      expect(detector.scan('Hello, this is a normal message.')).toHaveLength(0);
    });
  });

  describe('redact', () => {
    it('redacts email addresses', () => {
      expect(detector.redact('Contact user@example.com')).toBe('Contact [EMAIL]');
    });

    it('redacts SSN', () => {
      expect(detector.redact('SSN: 123-45-6789')).toBe('SSN: [SSN]');
    });

    it('redacts multiple PII types', () => {
      const result = detector.redact('Email user@test.com, SSN 123-45-6789');
      expect(result).toContain('[EMAIL]');
      expect(result).toContain('[SSN]');
    });

    it('preserves non-PII text', () => {
      expect(detector.redact('Hello world')).toBe('Hello world');
    });
  });

  describe('redactFindings', () => {
    it('selectively redacts specific findings', () => {
      const text = 'Email user@test.com, SSN 123-45-6789';
      const findings = detector.scan(text);
      const emailOnly = findings.filter((f) => f.redacted === '[EMAIL]');
      const result = detector.redactFindings(text, emailOnly);
      expect(result).toContain('[EMAIL]');
      expect(result).toContain('123-45-6789');
    });
  });
});
