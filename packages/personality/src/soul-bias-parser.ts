/**
 * Parses SOUL.md content for domain-indicative keywords and produces
 * trait weight biases. Uses the same keyword sets as The Architect's
 * context detector (17 domains).
 *
 * Biases are in the range [0, 0.15] — subtle nudges, not overrides.
 * Only domains with >= 3 keyword hits produce a bias.
 */

type ContextDomain = string;

const DOMAIN_KEYWORDS: Record<ContextDomain, string[]> = {
  security_review: ['vulnerability', 'vulnerabilities', 'CVE', 'threat', 'exploit', 'patch', 'audit', 'compliance', 'penetration', 'firewall', 'incident', 'breach', 'SIEM', 'SOC', 'CTEM', 'attack surface', 'zero-day', 'security', 'encryption', 'authentication', 'authorization', 'hardening', 'malware', 'phishing'],
  code_engineering: ['function', 'API', 'deploy', 'refactor', 'test', 'build', 'pipeline', 'CI/CD', 'container', 'microservice', 'typescript', 'python', 'rust', 'terraform', 'code', 'programming', 'database', 'git', 'docker', 'react', 'node', 'npm'],
  architecture_design: ['architecture', 'scalability', 'ADR', 'microservice', 'monolith', 'event-driven', 'platform', 'infrastructure', 'distributed', 'load balancer', 'service mesh', 'database design', 'schema', 'data model', 'tech stack'],
  debugging: ['error', 'bug', 'crash', 'stack trace', 'exception', 'timeout', 'fix', 'regression', 'flaky', 'memory leak', 'segfault', 'logs'],
  team_leadership: ['team', 'hire', 'hiring', 'performance', 'culture', 'morale', 'feedback', 'onboarding', 'manage', 'leadership', 'standup', 'sprint', 'agile'],
  crisis_management: ['breach', 'outage', 'incident', 'emergency', 'compromised', 'escalation', 'P1', 'disaster', 'recovery', 'rollback', 'hotfix', 'war room', 'postmortem'],
  creative_work: ['brainstorm', 'creative', 'concept', 'innovation', 'prototype', 'design thinking', 'inspiration', 'experiment'],
  writing_content: ['blog', 'article', 'newsletter', 'documentation', 'write', 'draft', 'edit', 'copy', 'essay', 'report'],
  strategic_planning: ['strategy', 'roadmap', 'vision', 'priority', 'OKR', 'initiative', 'resource allocation', 'planning', 'goals', 'KPI'],
  decision_making: ['decide', 'trade-off', 'pros and cons', 'risk', 'compare', 'alternatives', 'evaluate', 'criteria'],
  personal_development: ['career', 'resume', 'interview', 'skill', 'certification', 'learning', 'growth path', 'mentor', 'promotion'],
  sales_pitch: ['pitch', 'proposal', 'sell', 'demo', 'close', 'deal', 'prospect', 'value prop', 'ROI', 'pipeline'],
  negotiation: ['negotiate', 'contract', 'terms', 'concession', 'counter-offer', 'compensation', 'salary', 'leverage'],
  marketing_content: ['brand', 'audience', 'campaign', 'SEO', 'content strategy', 'positioning', 'social media', 'marketing', 'funnel', 'conversion'],
  one_on_one: ['1:1', 'one-on-one', 'check-in', 'career', 'coaching', 'mentoring', 'direct report', 'feedback'],
  learning_research: ['research', 'study', 'paper', 'methodology', 'analysis', 'findings', 'literature', 'experiment', 'data', 'hypothesis'],
};

const MIN_HITS = 3;
const MAX_BIAS = 0.15;
const BIAS_PER_HIT = 0.03;

export function parseSoulBiases(soulContent: string): Record<string, number> {
  if (!soulContent.trim()) return {};

  const lower = soulContent.toLowerCase();
  const biases: Record<string, number> = {};

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    let hits = 0;
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) {
        hits++;
      }
    }
    if (hits >= MIN_HITS) {
      biases[domain] = Math.min(hits * BIAS_PER_HIT, MAX_BIAS);
    }
  }

  return biases;
}
