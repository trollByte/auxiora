import { describe, it, expect } from 'vitest';
import { PiiDetector } from '../src/pii-detector.js';

describe('PiiDetector', () => {
  const detector = new PiiDetector();

  describe('detect', () => {
    it('detects email addresses', () => {
      const threats = detector.detect('Contact me at user@example.com please');
      expect(threats).toHaveLength(1);
      expect(threats[0].type).toBe('pii');
      expect(threats[0].match).toBe('user@example.com');
      expect(threats[0].level).toBe('medium');
    });

    it('detects multiple emails', () => {
      const threats = detector.detect('Email a@b.com or c@d.org');
      expect(threats.filter(t => t.match?.includes('@'))).toHaveLength(2);
    });

    it('detects SSN patterns', () => {
      const threats = detector.detect('My SSN is 123-45-6789');
      const ssn = threats.find(t => t.match === '123-45-6789');
      expect(ssn).toBeDefined();
      expect(ssn!.level).toBe('high');
    });

    it('detects credit card numbers with Luhn validation', () => {
      const threats = detector.detect('Card: 4111 1111 1111 1111');
      const cc = threats.find(t => t.description.includes('credit_card'));
      expect(cc).toBeDefined();
      expect(cc!.level).toBe('high');
    });

    it('rejects invalid credit card numbers', () => {
      const threats = detector.detect('Number: 1234 5678 9012 3456');
      const cc = threats.find(t => t.description.includes('credit_card'));
      expect(cc).toBeUndefined();
    });

    it('detects phone numbers', () => {
      const threats = detector.detect('Call me at (555) 123-4567');
      const phone = threats.find(t => t.description.includes('phone'));
      expect(phone).toBeDefined();
    });

    it('detects international phone numbers', () => {
      const threats = detector.detect('Phone: +1-555-123-4567');
      const phone = threats.find(t => t.description.includes('phone'));
      expect(phone).toBeDefined();
    });

    it('detects IP addresses', () => {
      const threats = detector.detect('Server at 192.168.1.100');
      const ip = threats.find(t => t.description.includes('ip_address'));
      expect(ip).toBeDefined();
      expect(ip!.level).toBe('low');
    });

    it('detects dates of birth', () => {
      const threats = detector.detect('DOB: 01/15/1990');
      const dob = threats.find(t => t.description.includes('dob'));
      expect(dob).toBeDefined();
      expect(dob!.level).toBe('high');
    });

    it('detects birthday patterns', () => {
      const threats = detector.detect('born on 01/15/1990');
      const dob = threats.find(t => t.description.includes('dob'));
      expect(dob).toBeDefined();
    });

    it('returns locations for detected PII', () => {
      const text = 'Email: user@example.com';
      const threats = detector.detect(text);
      const emailThreat = threats.find(t => t.match === 'user@example.com');
      expect(emailThreat!.location).toBeDefined();
      expect(emailThreat!.location!.start).toBe(7);
      expect(emailThreat!.location!.end).toBe(23);
    });

    it('returns empty array for clean text', () => {
      const threats = detector.detect('Hello, this is a normal message.');
      expect(threats).toHaveLength(0);
    });
  });

  describe('redact', () => {
    it('redacts email addresses', () => {
      const result = detector.redact('Contact user@example.com');
      expect(result).toBe('Contact [EMAIL]');
    });

    it('redacts SSN', () => {
      const result = detector.redact('SSN: 123-45-6789');
      expect(result).toBe('SSN: [SSN]');
    });

    it('redacts credit card numbers', () => {
      const result = detector.redact('Card: 4111 1111 1111 1111');
      expect(result).toBe('Card: [CREDIT_CARD]');
    });

    it('redacts IP addresses', () => {
      const result = detector.redact('Server: 192.168.1.1');
      expect(result).toBe('Server: [IP_ADDRESS]');
    });

    it('redacts multiple PII types', () => {
      const result = detector.redact('Email user@test.com, SSN 123-45-6789');
      expect(result).toContain('[EMAIL]');
      expect(result).toContain('[SSN]');
      expect(result).not.toContain('user@test.com');
      expect(result).not.toContain('123-45-6789');
    });

    it('preserves non-PII text', () => {
      const result = detector.redact('Hello world, no PII here');
      expect(result).toBe('Hello world, no PII here');
    });
  });
});
