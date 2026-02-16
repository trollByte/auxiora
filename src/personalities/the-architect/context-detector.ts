import type { TaskContext, ContextDomain, EmotionalRegister, ContextSignal } from '../schema.js';
import type { CorrectionStore } from './correction-store.js';

// ────────────────────────────────────────────────────────────────────────────
// Domain signals
// ────────────────────────────────────────────────────────────────────────────

const DOMAIN_SIGNALS: Record<ContextDomain, ContextSignal> = {
  security_review: {
    keywords: ['vulnerability', 'vulnerabilities', 'CVE', 'threat', 'exploit', 'patch', 'audit', 'compliance', 'penetration', 'firewall', 'incident', 'breach', 'SIEM', 'SOC', 'CTEM', 'attack surface', 'zero-day', 'Qualys', 'CrowdStrike', 'Splunk', 'Wiz', 'TORQ', 'security', 'encryption', 'authentication', 'authorization', 'password', 'token', 'OAuth', 'RBAC', 'permissions', 'access control', 'hardening', 'malware', 'phishing', 'ransomware', 'hacked', 'hack', 'secure'],
    patterns: ['review this security', 'is this secure', 'how would an attacker', 'what are the risks', 'FCA audit', 'threat model', 'security posture', 'attack vector', 'security review', 'security check', 'pen test', 'red team', 'how safe is', 'lock down', 'tighten security', 'security best practice', 'security issues', 'got hacked', 'been hacked', 'we got hacked', 'check for vulnerabilit'],
    confidence_threshold: 0.35,
  },
  code_engineering: {
    keywords: ['function', 'API', 'deploy', 'refactor', 'test', 'build', 'pipeline', 'CI/CD', 'container', 'microservice', 'endpoint', 'typescript', 'python', 'rust', 'terraform', 'code', 'programming', 'variable', 'database', 'query', 'git', 'commit', 'branch', 'server', 'backend', 'frontend', 'npm', 'docker', 'react', 'node', 'package', 'module', 'class', 'method', 'library', 'framework', 'component', 'repository', 'repo', 'script', 'compiler', 'runtime'],
    patterns: ['write a function', 'debug this', 'optimize this code', 'implement', 'how should I structure', 'write code', 'fix the code', 'add a feature', 'code review', 'pull request', 'write a script', 'build a', 'set up a', 'create an API', 'write a test', 'help me code', 'coding', 'how do I implement'],
    confidence_threshold: 0.35,
  },
  architecture_design: {
    keywords: ['architecture', 'design', 'system', 'scalability', 'ADR', 'microservice', 'monolith', 'event-driven', 'CNAPP', 'platform', 'infrastructure', 'distributed', 'load balancer', 'service mesh', 'database design', 'schema', 'data model', 'tech stack', 'migration', 'modular', 'coupling', 'cohesion', 'abstraction', 'layer'],
    patterns: ['how should we architect', 'what pattern should', 'design decision', 'trade-offs between', 'should we use X or Y', 'system design', 'how should I design', 'what architecture', 'best approach for', 'how to structure', 'high level design', 'technical design'],
    confidence_threshold: 0.35,
  },
  debugging: {
    keywords: ['error', 'bug', 'crash', 'failed', 'broken', 'stack trace', 'exception', 'undefined', 'null', 'timeout', 'fix', 'issue', 'problem', 'wrong', 'unexpected', 'regression', 'flaky', 'intermittent', 'memory leak', 'segfault', 'panic', 'abort', 'logs'],
    patterns: ['why is this', 'not working', 'getting an error', 'keeps failing', 'can you fix', 'what went wrong', "doesn't work", 'help me fix', 'figure out why', 'stopped working', 'something broke', 'track down', 'root cause', "can't figure out", 'keeps crashing', 'throwing an error'],
    confidence_threshold: 0.35,
  },
  team_leadership: {
    keywords: ['team', 'hire', 'hiring', 'performance', 'culture', 'morale', 'feedback', 'promotion', 'development', 'retention', 'onboarding', 'manage', 'leadership', 'report', 'standup', 'org', 'headcount', 'staffing', 'firing', 'letting go', 'PIP', 'underperforming', 'sprint', 'agile', 'people'],
    patterns: ['how do I handle', 'my team is', 'should I tell them', 'managing', 'struggling with their performance', 'lead my team', 'build a team', 'run a team', 'manage my team', 'team meeting', 'team morale', 'team dynamic', 'team culture', 'scale the team', 'hire for', 'fire someone', 'let someone go', 'hire more', 'should I hire', 'grow the team'],
    confidence_threshold: 0.35,
  },
  one_on_one: {
    keywords: ['1:1', 'one-on-one', 'check-in', 'career', 'growth', 'feedback for', 'coaching', 'mentoring', 'direct report', 'skip level', 'performance review'],
    patterns: ['meeting with my', 'how do I give feedback', 'they seem disengaged', 'want to develop them', 'prep for my 1:1', 'give them feedback', 'talk to them about', 'have a conversation with', 'difficult conversation', 'career conversation', 'growth conversation', 'review meeting'],
    confidence_threshold: 0.35,
  },
  sales_pitch: {
    keywords: ['pitch', 'proposal', 'sell', 'demo', 'close', 'deal', 'prospect', 'value prop', 'objection', 'ROI', 'sales', 'revenue', 'pipeline', 'quota', 'lead', 'customer', 'pricing', 'discount', 'upsell', 'renewal'],
    patterns: ['how do I sell', 'convince them to', 'make the case for', 'justify the budget', 'executive presentation', 'close the deal', 'sales pitch', 'sales email', 'sales deck', 'win the deal', 'pitch to', 'sell this to', 'handle objection', 'follow up with the prospect', 'sales call'],
    confidence_threshold: 0.35,
  },
  negotiation: {
    keywords: ['negotiate', 'contract', 'terms', 'concession', 'counter-offer', 'vendor', 'compensation', 'salary', 'offer', 'leverage', 'agreement', 'deal', 'BATNA', 'walkaway', 'raise', 'benefits', 'package'],
    patterns: ['how should I respond to their offer', 'they want us to', 'push back on', 'what leverage do I have', 'negotiate the terms', 'negotiate my', 'ask for a raise', 'counter their offer', 'salary negotiation', 'vendor negotiation', 'contract negotiation', 'negotiate with', 'get a better deal', 'what should I ask for'],
    confidence_threshold: 0.35,
  },
  marketing_content: {
    keywords: ['brand', 'audience', 'campaign', 'SEO', 'content strategy', 'positioning', 'social media', 'newsletter', 'marketing', 'ads', 'advertising', 'funnel', 'conversion', 'engagement', 'branding', 'copy', 'tagline', 'target market', 'launch', 'promotion', 'outreach', 'inbound', 'leads', 'landing page', 'email campaign', 'growth hack'],
    patterns: ['how do we position', 'what should our messaging', 'content calendar', 'build an audience', 'marketing strategy', 'grow our audience', 'write marketing', 'marketing email', 'marketing plan', 'go-to-market', 'product launch', 'brand voice', 'social post', 'ad copy', 'marketing campaign', 'reach more', 'attract customers', 'generate leads', 'promote our'],
    confidence_threshold: 0.35,
  },
  strategic_planning: {
    keywords: ['strategy', 'roadmap', 'vision', 'priority', 'quarter', 'OKR', 'initiative', 'investment', 'resource allocation', 'planning', 'goals', 'objectives', 'KPI', 'metric', 'budget', 'forecast', 'milestone', 'alignment', 'stakeholder'],
    patterns: ['should we invest in', 'what should our strategy be', 'how do we prioritize', 'next quarter', 'three-year plan', 'strategic direction', 'build a roadmap', 'annual plan', 'set goals', 'set OKRs', 'plan for next', 'long-term plan', 'where should we focus', 'resource planning', 'strategic priorities', 'business plan'],
    confidence_threshold: 0.35,
  },
  crisis_management: {
    keywords: ['breach', 'outage', 'incident', 'down', 'emergency', 'compromised', 'escalation', 'P1', 'severity 1', 'urgent', 'critical issue', 'disaster', 'recovery', 'rollback', 'hotfix', 'war room', 'postmortem'],
    patterns: ['we just got', 'everything is broken', 'how do we respond', 'the board is asking', 'media is calling', 'need to act now', 'site is down', 'system is down', 'production is down', 'customers are affected', 'data loss', 'on fire', 'all hands', 'dropped the ball', 'damage control'],
    confidence_threshold: 0.30,
  },
  creative_work: {
    keywords: ['brainstorm', 'idea', 'creative', 'concept', 'innovation', 'vision', 'imagine', 'prototype', 'design thinking', 'inspiration', 'workshop', 'whiteboard', 'explore', 'experiment', 'invent', 'original', 'fresh'],
    patterns: ['help me think of', 'what if we', 'how could we make this more', 'I need ideas for', 'come up with', 'get creative', 'brainstorm ideas', 'think outside the box', 'new ideas for', 'creative ways to', 'how can we innovate', 'reimagine', 'blue sky', 'spitball', 'riff on this', 'help me brainstorm', 'let me brainstorm', 'brainstorm with me'],
    confidence_threshold: 0.35,
  },
  writing_content: {
    keywords: ['blog', 'article', 'post', 'newsletter', 'documentation', 'write', 'draft', 'edit', 'tone', 'copy', 'essay', 'email', 'message', 'announcement', 'memo', 'report', 'summary', 'outline', 'proofread', 'rewrite', 'headline', 'subject line'],
    patterns: ['write a blog post', 'help me draft', 'review this writing', 'how should I frame', 'write an email', 'draft a message', 'write about', 'help me write', 'draft an email', 'write a memo', 'write a report', 'edit this', 'proofread this', 'rewrite this', 'make this sound', 'better way to say', 'rephrase this', 'write a summary', 'craft a message'],
    confidence_threshold: 0.35,
  },
  decision_making: {
    keywords: ['decide', 'choice', 'option', 'trade-off', 'should I', 'pros and cons', 'risk', 'compare', 'alternatives', 'weigh', 'dilemma', 'evaluate', 'assessment', 'criteria', 'or stay', 'or leave', 'or wait'],
    patterns: ['should I do X or Y', 'what would you do', 'help me decide', 'weighing my options', 'which one should I', 'what are my options', 'help me choose', 'which is better', 'A or B', 'make a decision', 'torn between', 'on the fence', 'not sure whether to', 'evaluate my options', 'which path should I', 'take it or', 'stay or go', 'should I take', 'should I accept', 'should I leave', 'should I stay'],
    confidence_threshold: 0.35,
  },
  personal_development: {
    keywords: ['career', 'CISO', 'resume', 'interview', 'skill', 'certification', 'learning', 'growth path', 'mentor', 'promotion', 'promoted', 'job', 'role', 'transition', 'networking', 'LinkedIn', 'portfolio', 'personal brand', 'side project', 'raise', 'title', 'seniority'],
    patterns: ['how do I get to', 'should I pursue', 'what should I learn next', 'preparing for an interview', 'my career path', 'advance my career', 'new role', 'next step in my career', 'get promoted', 'switch careers', 'level up', 'grow as a', 'become a better', 'prepare for', 'break into', 'land a job', 'build my skills', 'take the job', 'new job', 'change jobs', 'stay or leave', 'leave my job'],
    confidence_threshold: 0.35,
  },
  learning_research: {
    keywords: ['explain', 'how does', 'what is', 'teach me', 'understand', 'deep dive', 'research', 'learn', 'tutorial', 'guide', 'concept', 'fundamentals', 'basics', 'primer', 'overview', 'introduction'],
    patterns: ['help me understand', 'explain like', "what's the difference between", 'I want to learn about', 'can you explain', 'how do I learn', 'walk me through', 'break it down', 'ELI5', 'in simple terms', 'how does this work', 'what does this mean', 'tell me about', 'give me an overview', 'crash course', 'quick primer on', 'explain how', 'how does a', 'what are', 'what is a', 'what is the'],
    confidence_threshold: 0.35,
  },
  general: {
    keywords: [],
    patterns: [],
    confidence_threshold: 0,
  },
};

// ────────────────────────────────────────────────────────────────────────────
// Emotional signals
// ────────────────────────────────────────────────────────────────────────────

const EMOTIONAL_SIGNALS: Record<Exclude<EmotionalRegister, 'neutral'>, string[]> = {
  stressed: ['overwhelmed', 'drowning', 'too much', "can't keep up", 'burning out', 'exhausted', 'behind on everything', 'swamped'],
  frustrated: ['broken', 'stupid', "doesn't work", 'waste of time', 'tried everything', 'sick of', 'fed up', 'ugh', 'ridiculous'],
  uncertain: ["I don't know", 'not sure', 'confused', 'lost', 'what should I', 'am I wrong', 'is this right', 'no idea'],
  excited: ['amazing', 'breakthrough', 'just realized', 'huge', 'this changes everything', 'figured it out', 'holy', 'incredible'],
  celebratory: ['we did it', 'shipped', 'launched', 'won', 'promoted', 'passed the audit', 'got the offer', 'nailed it'],
};

// ────────────────────────────────────────────────────────────────────────────
// Scoring
// ────────────────────────────────────────────────────────────────────────────

const KEYWORD_WEIGHT = 0.20;
const PATTERN_WEIGHT = 0.25;

function scoreDomain(domain: ContextDomain, message: string): number {
  const signal = DOMAIN_SIGNALS[domain];
  const lower = message.toLowerCase();
  let score = 0;

  for (const keyword of signal.keywords) {
    if (lower.includes(keyword.toLowerCase())) {
      score += KEYWORD_WEIGHT;
    }
  }

  for (const pattern of signal.patterns) {
    if (lower.includes(pattern.toLowerCase())) {
      score += PATTERN_WEIGHT;
    }
  }

  return score;
}

/**
 * Returns all domain scores for debugging and transparency.
 * Useful for understanding why a particular domain was selected.
 */
export function scoreAllDomains(message: string): Record<ContextDomain, number> {
  const scores = {} as Record<ContextDomain, number>;
  for (const domain of Object.keys(DOMAIN_SIGNALS) as ContextDomain[]) {
    scores[domain] = scoreDomain(domain, message);
  }
  return scores;
}

// ────────────────────────────────────────────────────────────────────────────
// Detection logic
// ────────────────────────────────────────────────────────────────────────────

function detectDomain(message: string): { domain: ContextDomain; confidence: number } {
  let bestDomain: ContextDomain = 'general';
  let bestScore = 0;

  for (const domain of Object.keys(DOMAIN_SIGNALS) as ContextDomain[]) {
    if (domain === 'general') continue;
    const score = scoreDomain(domain, message);
    const threshold = DOMAIN_SIGNALS[domain].confidence_threshold;
    if (score >= threshold && score > bestScore) {
      bestScore = score;
      bestDomain = domain;
    }
  }

  return { domain: bestDomain, confidence: bestScore };
}

function detectEmotionalRegister(message: string): EmotionalRegister {
  const lower = message.toLowerCase();
  let bestRegister: EmotionalRegister = 'neutral';
  let bestCount = 0;

  for (const [register, signals] of Object.entries(EMOTIONAL_SIGNALS) as Array<[Exclude<EmotionalRegister, 'neutral'>, string[]]>) {
    let count = 0;
    for (const signal of signals) {
      if (lower.includes(signal.toLowerCase())) {
        count++;
      }
    }
    if (count > bestCount) {
      bestCount = count;
      bestRegister = register;
    }
  }

  // Punctuation-based detection as tiebreaker or supplement
  if (bestRegister === 'neutral') {
    const hasExcessiveCaps = (message.replace(/[^A-Z]/g, '').length / Math.max(message.replace(/\s/g, '').length, 1)) > 0.5 && message.length > 10;
    const hasMultipleExclamation = /!{2,}/.test(message);
    const hasEllipsisChains = /\.{3,}/.test(message) || /…{2,}/.test(message);

    if (hasExcessiveCaps && hasMultipleExclamation) {
      // Could be excited or frustrated — check for negative keywords
      const negativeSignals = ['broken', 'stupid', "doesn't work", 'fail', 'wrong', 'terrible', 'awful'];
      const hasNegative = negativeSignals.some((s) => lower.includes(s));
      bestRegister = hasNegative ? 'frustrated' : 'excited';
    } else if (hasMultipleExclamation) {
      bestRegister = 'excited';
    } else if (hasEllipsisChains) {
      const stressSignals = ['overwhelmed', 'too much', "can't", 'behind'];
      const hasStress = stressSignals.some((s) => lower.includes(s));
      bestRegister = hasStress ? 'stressed' : 'uncertain';
    }
  }

  return bestRegister;
}

function inferComplexity(message: string, domain: ContextDomain): TaskContext['complexity'] {
  if (domain === 'crisis_management') return 'crisis';

  const wordCount = message.split(/\s+/).length;

  if (wordCount < 20 && /^(what|who|when|where|how|is|are|can|does|do|should)\b/i.test(message.trim())) {
    return 'quick_answer';
  }

  const lower = message.toLowerCase();
  const deepSignals = ['analyze', 'analysis', 'review', 'strategy', 'in-depth', 'deep dive', 'comprehensive', 'evaluate'];
  const hasDeepSignal = deepSignals.some((s) => lower.includes(s));

  if (hasDeepSignal || wordCount > 100) return 'deep_analysis';

  return 'moderate';
}

function inferStakes(message: string, domain: ContextDomain): TaskContext['stakes'] {
  if (domain === 'crisis_management') return 'critical';

  const lower = message.toLowerCase();
  const criticalSignals = ['board', 'regulator', 'legal', 'FCA', 'SEC', 'lawsuit', 'compliance violation'];
  if (criticalSignals.some((s) => lower.includes(s.toLowerCase()))) return 'critical';

  const highStakesDomains: ContextDomain[] = ['security_review', 'strategic_planning', 'negotiation'];
  if (highStakesDomains.includes(domain)) return 'high';

  if (domain === 'decision_making' && lower.includes('irreversible')) return 'high';

  const lowStakesDomains: ContextDomain[] = ['learning_research', 'general'];
  if (lowStakesDomains.includes(domain)) return 'low';

  return 'moderate';
}

function inferMode(message: string, _history?: Array<{ role: string; content: string }>): TaskContext['mode'] {
  const lower = message.toLowerCase();

  const teamSignals = ['team', 'we ', 'our ', 'colleague', 'direct report', 'my report', 'my manager', 'my lead'];
  if (teamSignals.some((s) => lower.includes(s))) return 'team_context';

  const externalSignals = ['customer', 'prospect', 'vendor', 'client', 'public', 'board', 'investor', 'media', 'audience'];
  if (externalSignals.some((s) => lower.includes(s))) return 'external_facing';

  const personalSignals = ['my career', 'my growth', 'I feel', "I'm struggling", 'personal', 'my goals', 'my path'];
  if (personalSignals.some((s) => lower.includes(s))) return 'personal';

  return 'solo_work';
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

/**
 * Detects the full task context from a user message and optional conversation
 * history. Combines domain detection, emotional register analysis, complexity
 * inference, stakes assessment, and mode classification into a single
 * TaskContext object that drives trait modulation.
 *
 * When a `correctionStore` is provided, the auto-detected domain is checked
 * against learned correction patterns. If a high-confidence correction is
 * found, it overrides the detection and the `corrected` / `originalDomain`
 * fields are set on the returned context.
 */
export function detectContext(
  userMessage: string,
  history?: Array<{ role: string; content: string }>,
  correctionStore?: CorrectionStore,
): TaskContext {
  const { domain: detectedDomain, confidence } = detectDomain(userMessage);
  const emotionalRegister = detectEmotionalRegister(userMessage);

  // Check for learned corrections
  let domain = detectedDomain;
  let corrected = false;
  let originalDomain: ContextDomain | undefined;

  if (correctionStore) {
    const suggestion = correctionStore.suggestCorrection(userMessage, detectedDomain);
    if (suggestion !== null) {
      originalDomain = detectedDomain;
      domain = suggestion;
      corrected = true;
    }
  }

  const complexity = inferComplexity(userMessage, domain);
  const stakes = inferStakes(userMessage, domain);
  const mode = inferMode(userMessage, history);

  return {
    domain,
    emotionalRegister,
    complexity,
    stakes,
    mode,
    ...(corrected ? { corrected, originalDomain } : {}),
    detectionConfidence: confidence,
  };
}
