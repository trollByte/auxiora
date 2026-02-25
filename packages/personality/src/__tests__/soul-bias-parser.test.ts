import { describe, it, expect } from 'vitest';
import { parseSoulBiases } from '../soul-bias-parser.js';

describe('parseSoulBiases', () => {
  it('should detect security bias from security-focused SOUL.md', () => {
    const soul = `You are a security-first assistant.
Always check for vulnerabilities and audit compliance.
Prioritize encryption and authentication in all recommendations.
Review threat models and access controls carefully.`;
    const biases = parseSoulBiases(soul);
    expect(biases['security_review']).toBeGreaterThan(0);
    expect(biases['security_review']).toBeLessThanOrEqual(0.15);
  });

  it('should detect code engineering bias', () => {
    const soul = `You specialize in TypeScript and React development.
Help with code reviews, API design, and testing.
Focus on clean architecture and CI/CD pipelines.
Assist with refactoring and debugging.`;
    const biases = parseSoulBiases(soul);
    expect(biases['code_engineering']).toBeGreaterThan(0);
  });

  it('should return empty object for generic SOUL.md', () => {
    const soul = `You are a helpful assistant. Be kind and concise.`;
    const biases = parseSoulBiases(soul);
    expect(Object.keys(biases).length).toBe(0);
  });

  it('should return empty object for empty string', () => {
    const biases = parseSoulBiases('');
    expect(Object.keys(biases).length).toBe(0);
  });

  it('should cap biases at 0.15', () => {
    const soul = `vulnerability CVE threat exploit patch audit compliance penetration
firewall incident breach SIEM SOC CTEM attack surface zero-day Qualys
CrowdStrike Splunk Wiz TORQ security encryption authentication authorization`;
    const biases = parseSoulBiases(soul);
    expect(biases['security_review']).toBe(0.15);
  });

  it('should detect multiple domain biases', () => {
    const soul = `You are a security-focused engineering assistant.
Help with code reviews, vulnerability assessments, and API design.
Focus on secure coding practices, threat modeling, and refactoring.
Assist with testing, CI/CD pipelines, and deployment.
Review authentication, encryption, and audit compliance.`;
    const biases = parseSoulBiases(soul);
    expect(Object.keys(biases).length).toBeGreaterThanOrEqual(2);
  });
});
