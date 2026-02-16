import type { TaskContext, ContextDomain, EmotionalRegister, ContextSignal } from '../schema.js';

// ────────────────────────────────────────────────────────────────────────────
// Domain signals
// ────────────────────────────────────────────────────────────────────────────

const DOMAIN_SIGNALS: Record<ContextDomain, ContextSignal> = {
  security_review: {
    keywords: ['vulnerability', 'CVE', 'threat', 'exploit', 'patch', 'audit', 'compliance', 'penetration', 'firewall', 'incident', 'breach', 'SIEM', 'SOC', 'CTEM', 'attack surface', 'zero-day', 'Qualys', 'CrowdStrike', 'Splunk', 'Wiz', 'TORQ'],
    patterns: ['review this security', 'is this secure', 'how would an attacker', 'what are the risks', 'FCA audit', 'threat model'],
    confidence_threshold: 0.6,
  },
  code_engineering: {
    keywords: ['function', 'API', 'deploy', 'refactor', 'test', 'build', 'pipeline', 'CI/CD', 'container', 'microservice', 'endpoint', 'typescript', 'python', 'rust', 'terraform'],
    patterns: ['write a function', 'debug this', 'optimize this code', 'implement', 'how should I structure'],
    confidence_threshold: 0.7,
  },
  architecture_design: {
    keywords: ['architecture', 'design', 'system', 'scalability', 'ADR', 'microservice', 'monolith', 'event-driven', 'CNAPP', 'platform'],
    patterns: ['how should we architect', 'what pattern should', 'design decision', 'trade-offs between', 'should we use X or Y'],
    confidence_threshold: 0.7,
  },
  debugging: {
    keywords: ['error', 'bug', 'crash', 'failed', 'broken', 'stack trace', 'exception', 'undefined', 'null', 'timeout'],
    patterns: ['why is this', 'not working', 'getting an error', 'keeps failing', 'can you fix'],
    confidence_threshold: 0.7,
  },
  team_leadership: {
    keywords: ['team', 'hire', 'performance', 'culture', 'morale', 'feedback', 'promotion', 'development', 'retention', 'onboarding'],
    patterns: ['how do I handle', 'my team is', 'should I tell them', 'managing', 'struggling with their performance'],
    confidence_threshold: 0.65,
  },
  one_on_one: {
    keywords: ['1:1', 'one-on-one', 'check-in', 'career', 'growth', 'feedback for', 'coaching'],
    patterns: ['meeting with my', 'how do I give feedback', 'they seem disengaged', 'want to develop them'],
    confidence_threshold: 0.7,
  },
  sales_pitch: {
    keywords: ['pitch', 'proposal', 'sell', 'demo', 'close', 'deal', 'prospect', 'value prop', 'objection', 'ROI'],
    patterns: ['how do I sell', 'convince them to', 'make the case for', 'justify the budget', 'executive presentation'],
    confidence_threshold: 0.7,
  },
  negotiation: {
    keywords: ['negotiate', 'contract', 'terms', 'concession', 'counter-offer', 'vendor', 'compensation', 'salary'],
    patterns: ['how should I respond to their offer', 'they want us to', 'push back on', 'what leverage do I have'],
    confidence_threshold: 0.7,
  },
  marketing_content: {
    keywords: ['brand', 'audience', 'campaign', 'SEO', 'content strategy', 'positioning', 'social media', 'newsletter'],
    patterns: ['how do we position', 'what should our messaging', 'content calendar', 'build an audience'],
    confidence_threshold: 0.7,
  },
  strategic_planning: {
    keywords: ['strategy', 'roadmap', 'vision', 'priority', 'quarter', 'OKR', 'initiative', 'investment', 'resource allocation'],
    patterns: ['should we invest in', 'what should our strategy be', 'how do we prioritize', 'next quarter', 'three-year plan'],
    confidence_threshold: 0.7,
  },
  crisis_management: {
    keywords: ['breach', 'outage', 'incident', 'down', 'emergency', 'compromised', 'escalation', 'P1', 'severity 1'],
    patterns: ['we just got', 'everything is broken', 'how do we respond', 'the board is asking', 'media is calling'],
    confidence_threshold: 0.5,
  },
  creative_work: {
    keywords: ['brainstorm', 'idea', 'creative', 'concept', 'innovation', 'vision'],
    patterns: ['help me think of', 'what if we', 'how could we make this more', 'I need ideas for'],
    confidence_threshold: 0.7,
  },
  writing_content: {
    keywords: ['blog', 'article', 'post', 'newsletter', 'documentation', 'write', 'draft', 'edit', 'tone'],
    patterns: ['write a blog post', 'help me draft', 'review this writing', 'how should I frame'],
    confidence_threshold: 0.7,
  },
  decision_making: {
    keywords: ['decide', 'choice', 'option', 'trade-off', 'should I', 'pros and cons', 'risk', 'compare'],
    patterns: ['should I do X or Y', 'what would you do', 'help me decide', 'weighing my options'],
    confidence_threshold: 0.65,
  },
  personal_development: {
    keywords: ['career', 'CISO', 'resume', 'interview', 'skill', 'certification', 'learning', 'growth path', 'mentor'],
    patterns: ['how do I get to', 'should I pursue', 'what should I learn next', 'preparing for an interview', 'my career path'],
    confidence_threshold: 0.7,
  },
  learning_research: {
    keywords: ['explain', 'how does', 'what is', 'teach me', 'understand', 'deep dive', 'research'],
    patterns: ['help me understand', 'explain like', "what's the difference between", 'I want to learn about'],
    confidence_threshold: 0.75,
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

const KEYWORD_WEIGHT = 0.15;
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

function detectDomain(message: string): ContextDomain {
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

  return bestDomain;
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
 */
export function detectContext(
  userMessage: string,
  history?: Array<{ role: string; content: string }>,
): TaskContext {
  const domain = detectDomain(userMessage);
  const emotionalRegister = detectEmotionalRegister(userMessage);
  const complexity = inferComplexity(userMessage, domain);
  const stakes = inferStakes(userMessage, domain);
  const mode = inferMode(userMessage, history);

  return {
    domain,
    emotionalRegister,
    complexity,
    stakes,
    mode,
  };
}
