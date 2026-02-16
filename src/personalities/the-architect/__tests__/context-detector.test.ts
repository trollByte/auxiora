import { describe, it, expect } from 'vitest';
import { detectContext, scoreAllDomains } from '../context-detector.js';

// ────────────────────────────────────────────────────────────────────────────
// Domain detection
// ────────────────────────────────────────────────────────────────────────────

describe('detectContext — domain detection', () => {
  it('detects security_review from vulnerability-related language', () => {
    // keywords: vulnerability, audit, threat, exploit, firewall (5 × 0.15 = 0.75) + pattern "is this secure" (0.25) = 1.0 >= threshold 0.6
    const ctx = detectContext('Is this secure? Review this config for security vulnerabilities — we need an audit to check for threat vectors, potential exploit paths, and firewall rules');
    expect(ctx.domain).toBe('security_review');
  });

  it('detects crisis_management from active breach language', () => {
    // pattern "we just got" (0.25) + keywords: breach, SOC, incident, escalation (0.60) = 0.85 >= 0.5
    const ctx = detectContext('We just got breached, the SOC is handling the incident and the escalation is underway');
    expect(ctx.domain).toBe('crisis_management');
  });

  it('detects one_on_one from 1:1 meeting prep language', () => {
    // keywords: 1:1, coaching, career, growth, feedback for (0.75) + pattern "they seem disengaged" (0.25) = 1.0 >= 0.7
    const ctx = detectContext('Help me prep for my 1:1 with Sarah — I want to give feedback for her career growth through coaching, they seem disengaged');
    expect(ctx.domain).toBe('one_on_one');
  });

  it('detects sales_pitch from pitch/sell language targeting an executive', () => {
    // keywords: pitch, sell, demo, ROI, prospect (0.75) + pattern "make the case for" (0.25) = 1.0 >= 0.7
    const ctx = detectContext('I need to pitch and sell this to a prospect — can you help me make the case for the ROI with a demo?');
    expect(ctx.domain).toBe('sales_pitch');
  });

  it('detects writing_content from blog post creation request', () => {
    const ctx = detectContext('Write a blog post about CTEM for ericfleming.ai');
    expect(ctx.domain).toBe('writing_content');
  });

  it('detects decision_making or personal_development for career dilemma', () => {
    // decision_making keywords: should I, risk, choice, pros and cons (0.60) + pattern "help me decide" (0.25) = 0.85 >= 0.65
    const ctx = detectContext('Should I take the CISO role or stay as Director? Help me decide — what are the pros and cons and the risk of each choice?');
    expect(['decision_making', 'personal_development']).toContain(ctx.domain);
  });

  it('detects learning_research from a conceptual question', () => {
    // keywords: what is, explain, understand, how does, teach me (0.75) >= 0.75
    const ctx = detectContext('What is a VLAN? Explain how it works — I want to understand how does it segment traffic. Teach me the basics.');
    expect(ctx.domain).toBe('learning_research');
  });

  it('returns general for casual greetings with no domain signals', () => {
    const ctx = detectContext("Hey what's up");
    expect(ctx.domain).toBe('general');
  });

  it('detects architecture_design from system design language', () => {
    // keywords: architecture, CNAPP, design, scalability, platform (0.75) + pattern "how should we architect" (0.25) = 1.0 >= 0.7
    const ctx = detectContext('How should we architect the CNAPP platform migration? I need to think about architecture, design, and scalability');
    expect(ctx.domain).toBe('architecture_design');
  });

  it('detects debugging from code failure language', () => {
    // keywords: null, error, bug, crash, undefined (0.75) + pattern "not working" (0.25) = 1.0 >= 0.7
    const ctx = detectContext('This function keeps returning null and throwing an error — there is a bug causing a crash on undefined values, not working at all');
    expect(ctx.domain).toBe('debugging');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Emotional register detection
// ────────────────────────────────────────────────────────────────────────────

describe('detectContext — emotional register', () => {
  it('detects stressed from overwhelm language', () => {
    const ctx = detectContext("I'm drowning in work, everything is piling up");
    expect(ctx.emotionalRegister).toBe('stressed');
  });

  it('detects frustrated from anger and futility language', () => {
    const ctx = detectContext("This stupid thing doesn't work and I've tried everything");
    expect(ctx.emotionalRegister).toBe('frustrated');
  });

  it('detects uncertain from self-doubt language', () => {
    const ctx = detectContext("I'm not sure if I'm doing this right, what do you think?");
    expect(ctx.emotionalRegister).toBe('uncertain');
  });

  it('detects excited from breakthrough language', () => {
    const ctx = detectContext('I just figured out the root cause, this changes everything!');
    expect(ctx.emotionalRegister).toBe('excited');
  });

  it('detects celebratory from achievement language', () => {
    // "we did it" and "nailed it" are celebratory signals
    const ctx = detectContext('We did it — we passed the audit and nailed it!');
    expect(ctx.emotionalRegister).toBe('celebratory');
  });

  it('returns neutral for a calm factual question', () => {
    const ctx = detectContext('Can you explain how OODA loops work?');
    expect(ctx.emotionalRegister).toBe('neutral');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Edge cases
// ────────────────────────────────────────────────────────────────────────────

describe('detectContext — edge cases', () => {
  it('crisis_management has the lowest threshold and triggers on ambiguous urgent language', () => {
    // crisis threshold is 0.5 — lower than most domains at 0.7
    const ctx = detectContext('Everything is broken, this is a P1 emergency and media is calling');
    expect(ctx.domain).toBe('crisis_management');
  });

  it('short simple questions do not over-classify into technical domains', () => {
    const ctx = detectContext('How are you?');
    expect(ctx.domain).toBe('general');
  });

  it('mixed signals resolve to highest confidence domain', () => {
    // Contains signals for both security_review and crisis_management
    const message = 'We have a severity 1 incident — a zero-day exploit just hit our firewall and the SOC is overwhelmed';
    const ctx = detectContext(message);
    const scores = scoreAllDomains(message);

    // The detected domain should have the highest score among those above threshold
    const detectedScore = scores[ctx.domain];
    for (const [domain, score] of Object.entries(scores)) {
      if (domain === 'general') continue;
      if (domain !== ctx.domain) {
        expect(detectedScore).toBeGreaterThanOrEqual(score);
      }
    }
  });

  it('complexity is crisis for crisis_management domain', () => {
    const ctx = detectContext('We just got breached, everything is down');
    expect(ctx.complexity).toBe('crisis');
  });

  it('short questions get quick_answer complexity', () => {
    const ctx = detectContext('What is a VLAN?');
    expect(ctx.complexity).toBe('quick_answer');
  });

  it('deep analysis signals produce deep_analysis complexity', () => {
    const ctx = detectContext(
      'I need a comprehensive analysis of our security posture including a deep dive into the attack surface and a review of all endpoints',
    );
    expect(ctx.complexity).toBe('deep_analysis');
  });

  it('team-related language sets team_context mode', () => {
    const ctx = detectContext('My team is struggling with the new process');
    expect(ctx.mode).toBe('team_context');
  });

  it('external stakeholder language sets external_facing mode', () => {
    const ctx = detectContext('How should I present this to the board?');
    expect(ctx.mode).toBe('external_facing');
  });

  it('personal career language sets personal mode', () => {
    const ctx = detectContext("I'm struggling with my career path");
    expect(ctx.mode).toBe('personal');
  });
});
