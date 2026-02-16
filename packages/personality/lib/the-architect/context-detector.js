// ────────────────────────────────────────────────────────────────────────────
// Domain signals
// ────────────────────────────────────────────────────────────────────────────
const DOMAIN_SIGNALS = {
    security_review: {
        keywords: ['vulnerability', 'CVE', 'threat', 'exploit', 'patch', 'audit', 'compliance', 'penetration', 'firewall', 'incident', 'breach', 'SIEM', 'SOC', 'CTEM', 'attack surface', 'zero-day', 'Qualys', 'CrowdStrike', 'Splunk', 'Wiz', 'TORQ', 'security', 'encryption', 'authentication', 'authorization'],
        patterns: ['review this security', 'is this secure', 'how would an attacker', 'what are the risks', 'FCA audit', 'threat model', 'security posture', 'attack vector'],
        confidence_threshold: 0.35,
    },
    code_engineering: {
        keywords: ['function', 'API', 'deploy', 'refactor', 'test', 'build', 'pipeline', 'CI/CD', 'container', 'microservice', 'endpoint', 'typescript', 'python', 'rust', 'terraform', 'code', 'programming', 'variable', 'database', 'query', 'git', 'commit', 'branch', 'server', 'backend', 'frontend'],
        patterns: ['write a function', 'debug this', 'optimize this code', 'implement', 'how should I structure', 'write code', 'fix the code', 'add a feature'],
        confidence_threshold: 0.35,
    },
    architecture_design: {
        keywords: ['architecture', 'design', 'system', 'scalability', 'ADR', 'microservice', 'monolith', 'event-driven', 'CNAPP', 'platform', 'infrastructure', 'distributed', 'load balancer', 'service mesh'],
        patterns: ['how should we architect', 'what pattern should', 'design decision', 'trade-offs between', 'should we use X or Y', 'system design'],
        confidence_threshold: 0.35,
    },
    debugging: {
        keywords: ['error', 'bug', 'crash', 'failed', 'broken', 'stack trace', 'exception', 'undefined', 'null', 'timeout', 'fix', 'issue', 'problem', 'wrong', 'unexpected'],
        patterns: ['why is this', 'not working', 'getting an error', 'keeps failing', 'can you fix', 'what went wrong', "doesn't work"],
        confidence_threshold: 0.35,
    },
    team_leadership: {
        keywords: ['team', 'hire', 'performance', 'culture', 'morale', 'feedback', 'promotion', 'development', 'retention', 'onboarding', 'manage', 'leadership', 'report', 'standup'],
        patterns: ['how do I handle', 'my team is', 'should I tell them', 'managing', 'struggling with their performance', 'lead my team'],
        confidence_threshold: 0.35,
    },
    one_on_one: {
        keywords: ['1:1', 'one-on-one', 'check-in', 'career', 'growth', 'feedback for', 'coaching', 'mentoring', 'direct report'],
        patterns: ['meeting with my', 'how do I give feedback', 'they seem disengaged', 'want to develop them', 'prep for my 1:1'],
        confidence_threshold: 0.35,
    },
    sales_pitch: {
        keywords: ['pitch', 'proposal', 'sell', 'demo', 'close', 'deal', 'prospect', 'value prop', 'objection', 'ROI', 'sales', 'revenue', 'pipeline', 'quota', 'lead'],
        patterns: ['how do I sell', 'convince them to', 'make the case for', 'justify the budget', 'executive presentation', 'close the deal'],
        confidence_threshold: 0.35,
    },
    negotiation: {
        keywords: ['negotiate', 'contract', 'terms', 'concession', 'counter-offer', 'vendor', 'compensation', 'salary', 'offer', 'leverage', 'agreement'],
        patterns: ['how should I respond to their offer', 'they want us to', 'push back on', 'what leverage do I have', 'negotiate the terms'],
        confidence_threshold: 0.35,
    },
    marketing_content: {
        keywords: ['brand', 'audience', 'campaign', 'SEO', 'content strategy', 'positioning', 'social media', 'newsletter', 'marketing', 'ads', 'advertising', 'funnel', 'conversion', 'engagement', 'branding', 'copy', 'tagline', 'target market'],
        patterns: ['how do we position', 'what should our messaging', 'content calendar', 'build an audience', 'marketing strategy', 'grow our audience', 'write marketing'],
        confidence_threshold: 0.35,
    },
    strategic_planning: {
        keywords: ['strategy', 'roadmap', 'vision', 'priority', 'quarter', 'OKR', 'initiative', 'investment', 'resource allocation', 'planning', 'goals', 'objectives', 'KPI', 'metric'],
        patterns: ['should we invest in', 'what should our strategy be', 'how do we prioritize', 'next quarter', 'three-year plan', 'strategic direction'],
        confidence_threshold: 0.35,
    },
    crisis_management: {
        keywords: ['breach', 'outage', 'incident', 'down', 'emergency', 'compromised', 'escalation', 'P1', 'severity 1', 'urgent', 'critical issue'],
        patterns: ['we just got', 'everything is broken', 'how do we respond', 'the board is asking', 'media is calling', 'need to act now'],
        confidence_threshold: 0.30,
    },
    creative_work: {
        keywords: ['brainstorm', 'idea', 'creative', 'concept', 'innovation', 'vision', 'imagine', 'prototype', 'design thinking', 'inspiration'],
        patterns: ['help me think of', 'what if we', 'how could we make this more', 'I need ideas for', 'come up with', 'get creative'],
        confidence_threshold: 0.35,
    },
    writing_content: {
        keywords: ['blog', 'article', 'post', 'newsletter', 'documentation', 'write', 'draft', 'edit', 'tone', 'copy', 'essay', 'email', 'message', 'announcement'],
        patterns: ['write a blog post', 'help me draft', 'review this writing', 'how should I frame', 'write an email', 'draft a message', 'write about'],
        confidence_threshold: 0.35,
    },
    decision_making: {
        keywords: ['decide', 'choice', 'option', 'trade-off', 'should I', 'pros and cons', 'risk', 'compare', 'alternatives', 'weigh'],
        patterns: ['should I do X or Y', 'what would you do', 'help me decide', 'weighing my options', 'which one should I', 'what are my options'],
        confidence_threshold: 0.35,
    },
    personal_development: {
        keywords: ['career', 'CISO', 'resume', 'interview', 'skill', 'certification', 'learning', 'growth path', 'mentor', 'promotion', 'job', 'role', 'transition'],
        patterns: ['how do I get to', 'should I pursue', 'what should I learn next', 'preparing for an interview', 'my career path', 'advance my career', 'new role'],
        confidence_threshold: 0.35,
    },
    learning_research: {
        keywords: ['explain', 'how does', 'what is', 'teach me', 'understand', 'deep dive', 'research', 'learn', 'tutorial', 'guide', 'concept'],
        patterns: ['help me understand', 'explain like', "what's the difference between", 'I want to learn about', 'can you explain', 'how do I learn'],
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
const EMOTIONAL_SIGNALS = {
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
function scoreDomain(domain, message) {
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
export function scoreAllDomains(message) {
    const scores = {};
    for (const domain of Object.keys(DOMAIN_SIGNALS)) {
        scores[domain] = scoreDomain(domain, message);
    }
    return scores;
}
// ────────────────────────────────────────────────────────────────────────────
// Detection logic
// ────────────────────────────────────────────────────────────────────────────
function detectDomain(message) {
    let bestDomain = 'general';
    let bestScore = 0;
    for (const domain of Object.keys(DOMAIN_SIGNALS)) {
        if (domain === 'general')
            continue;
        const score = scoreDomain(domain, message);
        const threshold = DOMAIN_SIGNALS[domain].confidence_threshold;
        if (score >= threshold && score > bestScore) {
            bestScore = score;
            bestDomain = domain;
        }
    }
    return { domain: bestDomain, confidence: bestScore };
}
function detectEmotionalRegister(message) {
    const lower = message.toLowerCase();
    let bestRegister = 'neutral';
    let bestCount = 0;
    for (const [register, signals] of Object.entries(EMOTIONAL_SIGNALS)) {
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
        }
        else if (hasMultipleExclamation) {
            bestRegister = 'excited';
        }
        else if (hasEllipsisChains) {
            const stressSignals = ['overwhelmed', 'too much', "can't", 'behind'];
            const hasStress = stressSignals.some((s) => lower.includes(s));
            bestRegister = hasStress ? 'stressed' : 'uncertain';
        }
    }
    return bestRegister;
}
function inferComplexity(message, domain) {
    if (domain === 'crisis_management')
        return 'crisis';
    const wordCount = message.split(/\s+/).length;
    if (wordCount < 20 && /^(what|who|when|where|how|is|are|can|does|do|should)\b/i.test(message.trim())) {
        return 'quick_answer';
    }
    const lower = message.toLowerCase();
    const deepSignals = ['analyze', 'analysis', 'review', 'strategy', 'in-depth', 'deep dive', 'comprehensive', 'evaluate'];
    const hasDeepSignal = deepSignals.some((s) => lower.includes(s));
    if (hasDeepSignal || wordCount > 100)
        return 'deep_analysis';
    return 'moderate';
}
function inferStakes(message, domain) {
    if (domain === 'crisis_management')
        return 'critical';
    const lower = message.toLowerCase();
    const criticalSignals = ['board', 'regulator', 'legal', 'FCA', 'SEC', 'lawsuit', 'compliance violation'];
    if (criticalSignals.some((s) => lower.includes(s.toLowerCase())))
        return 'critical';
    const highStakesDomains = ['security_review', 'strategic_planning', 'negotiation'];
    if (highStakesDomains.includes(domain))
        return 'high';
    if (domain === 'decision_making' && lower.includes('irreversible'))
        return 'high';
    const lowStakesDomains = ['learning_research', 'general'];
    if (lowStakesDomains.includes(domain))
        return 'low';
    return 'moderate';
}
function inferMode(message, _history) {
    const lower = message.toLowerCase();
    const teamSignals = ['team', 'we ', 'our ', 'colleague', 'direct report', 'my report', 'my manager', 'my lead'];
    if (teamSignals.some((s) => lower.includes(s)))
        return 'team_context';
    const externalSignals = ['customer', 'prospect', 'vendor', 'client', 'public', 'board', 'investor', 'media', 'audience'];
    if (externalSignals.some((s) => lower.includes(s)))
        return 'external_facing';
    const personalSignals = ['my career', 'my growth', 'I feel', "I'm struggling", 'personal', 'my goals', 'my path'];
    if (personalSignals.some((s) => lower.includes(s)))
        return 'personal';
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
export function detectContext(userMessage, history, correctionStore) {
    const { domain: detectedDomain, confidence } = detectDomain(userMessage);
    const emotionalRegister = detectEmotionalRegister(userMessage);
    // Check for learned corrections
    let domain = detectedDomain;
    let corrected = false;
    let originalDomain;
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
//# sourceMappingURL=context-detector.js.map