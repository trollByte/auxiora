# The Architect — Context Domain Reference

The Architect detects the domain of each message to select the most relevant thinking traits and communication style. This document describes all 17 domains, how detection works, and example messages that trigger each one.

## How Detection Works

Each domain has a set of **keywords** (worth 0.20 each) and **patterns** (worth 0.25 each). The detector scans the user's message for matches and sums the score. If a domain's score meets its **threshold** (typically 0.35), it qualifies. The highest-scoring domain wins. If no domain qualifies, the message falls to **General**.

In practice, **2 keyword matches** or **1 keyword + 1 pattern** is enough to trigger most domains.

Users can also **manually override** the detected domain using the edit button next to the context indicator in the chat UI, either for a single message or for the entire conversation.

---

## Domains

### 1. Security Review

**Icon:** :shield: &nbsp; **Threshold:** 0.35

Activates security-focused thinking traits (threat modeling, defense-in-depth, risk assessment).

**Example messages:**
- "Is this secure?"
- "Check for vulnerabilities"
- "Review this code for security issues"
- "We got hacked, what do we do?"

**Key triggers:** vulnerability, security, encryption, authentication, hack, breach, firewall, audit, CVE, phishing, malware, ransomware, RBAC, permissions

---

### 2. Engineering

**Icon:** :computer: &nbsp; **Threshold:** 0.35

Activates engineering thinking traits (clean code, testing, performance, pragmatism).

**Example messages:**
- "Help me write code for a REST API"
- "Build a Docker container"
- "Write a test for this function"
- "Help me code a React component"

**Key triggers:** code, function, API, deploy, refactor, test, build, pipeline, docker, git, database, typescript, python, frontend, backend, npm, repository

---

### 3. Architecture Design

**Icon:** :building_construction: &nbsp; **Threshold:** 0.35

Activates systems thinking traits (trade-off analysis, scalability, patterns).

**Example messages:**
- "How should I design the system?"
- "Microservice or monolith?"
- "What architecture should we use?"
- "High level design for a distributed system"

**Key triggers:** architecture, design, system, scalability, microservice, monolith, event-driven, infrastructure, distributed, tech stack, schema, data model, migration

---

### 4. Debugging

**Icon:** :bug: &nbsp; **Threshold:** 0.35

Activates systematic debugging traits (root cause analysis, hypothesis testing).

**Example messages:**
- "Fix this bug"
- "Why is this not working?"
- "Help me fix this error"
- "Something broke, can't figure out why"

**Key triggers:** error, bug, crash, failed, broken, fix, issue, problem, wrong, timeout, exception, stack trace, regression, memory leak

---

### 5. Team Leadership

**Icon:** :busts_in_silhouette: &nbsp; **Threshold:** 0.35

Activates leadership thinking traits (delegation, motivation, organizational design).

**Example messages:**
- "How do I manage my team better?"
- "Should I hire more people?"
- "My team morale is low"
- "How do I handle an underperforming employee?"

**Key triggers:** team, hire, hiring, performance, culture, morale, feedback, manage, leadership, onboarding, retention, staffing, PIP, people

---

### 6. One-on-One

**Icon:** :handshake: &nbsp; **Threshold:** 0.35

Activates coaching and mentoring traits (active listening, empathetic feedback, growth mindset).

**Example messages:**
- "Help me prep for my 1:1"
- "How do I give feedback to my direct report?"
- "They seem disengaged, how do I help?"
- "Preparing for a difficult conversation"

**Key triggers:** 1:1, one-on-one, coaching, mentoring, direct report, check-in, feedback for, career, growth, skip level, performance review

---

### 7. Sales

**Icon:** :chart_with_upwards_trend: &nbsp; **Threshold:** 0.35

Activates persuasion and value-communication traits (storytelling, objection handling, ROI framing).

**Example messages:**
- "Help me close the deal"
- "Write a sales pitch"
- "How do I handle this objection?"
- "Follow up with the prospect"

**Key triggers:** pitch, sell, demo, close, deal, prospect, ROI, sales, revenue, pipeline, customer, pricing, proposal, quota, objection

---

### 8. Negotiation

**Icon:** :handshake: &nbsp; **Threshold:** 0.35

Activates negotiation thinking traits (BATNA analysis, anchoring, leverage assessment).

**Example messages:**
- "Help me negotiate my salary"
- "Counter their offer"
- "What leverage do I have?"
- "How do I get a better deal?"

**Key triggers:** negotiate, contract, terms, salary, compensation, offer, leverage, counter-offer, vendor, BATNA, raise, agreement

---

### 9. Marketing

**Icon:** :mega: &nbsp; **Threshold:** 0.35

Activates marketing thinking traits (positioning, audience understanding, messaging).

**Example messages:**
- "Help me with a marketing email"
- "Marketing campaign for our launch"
- "How do we grow our audience?"
- "Write ad copy for this product"

**Key triggers:** marketing, brand, audience, campaign, SEO, social media, newsletter, ads, funnel, conversion, branding, positioning, landing page, content strategy

---

### 10. Strategic Planning

**Icon:** :dart: &nbsp; **Threshold:** 0.35

Activates strategic thinking traits (long-term vision, prioritization, resource allocation).

**Example messages:**
- "Build a roadmap for next quarter"
- "Set OKRs for the team"
- "Where should we focus our investment?"
- "What should our three-year plan look like?"

**Key triggers:** strategy, roadmap, vision, priority, quarter, OKR, initiative, investment, goals, objectives, KPI, budget, forecast, milestone

---

### 11. Crisis Management

**Icon:** :rotating_light: &nbsp; **Threshold:** 0.30 (lowest — triggers faster)

Activates crisis response traits (triage, communication under pressure, incident command).

**Example messages:**
- "My site is down and customers are affected"
- "Production is down, customers are complaining"
- "We have a P1 incident"
- "Everything is broken, need to act now"

**Key triggers:** outage, incident, down, emergency, breach, P1, severity 1, urgent, disaster, rollback, hotfix, war room, compromised

---

### 12. Creative

**Icon:** :bulb: &nbsp; **Threshold:** 0.35

Activates creative thinking traits (lateral thinking, idea generation, design thinking).

**Example messages:**
- "I need ideas for a new product"
- "Help me brainstorm"
- "What if we tried something completely different?"
- "Creative ways to solve this problem"

**Key triggers:** brainstorm, idea, creative, concept, innovation, imagine, prototype, design thinking, inspiration, experiment, invent

---

### 13. Writing

**Icon:** :memo: &nbsp; **Threshold:** 0.35

Activates writing craft traits (clarity, structure, tone, audience awareness).

**Example messages:**
- "Help me write an email to my boss"
- "Draft a blog post"
- "Rewrite this to sound more professional"
- "Write a summary of this meeting"

**Key triggers:** write, draft, edit, blog, article, email, memo, report, tone, proofread, rewrite, headline, newsletter, documentation, summary

---

### 14. Decision Making

**Icon:** :balance_scale: &nbsp; **Threshold:** 0.35

Activates analytical decision traits (frameworks, trade-off analysis, risk assessment).

**Example messages:**
- "Should I take the new job or stay?"
- "Help me decide between A or B"
- "What are the pros and cons?"
- "I'm torn between two options"

**Key triggers:** decide, choice, option, trade-off, should I, pros and cons, risk, compare, alternatives, dilemma, evaluate

---

### 15. Personal Development

**Icon:** :seedling: &nbsp; **Threshold:** 0.35

Activates growth and career thinking traits (self-assessment, goal setting, skill development).

**Example messages:**
- "How do I get promoted?"
- "What should I learn next for my career?"
- "How do I break into cybersecurity?"
- "Preparing for an interview"

**Key triggers:** career, resume, interview, skill, certification, promotion, promoted, job, role, mentor, LinkedIn, networking, growth path

---

### 16. Learning & Research

**Icon:** :books: &nbsp; **Threshold:** 0.35

Activates teaching and explanation traits (Socratic method, analogies, progressive disclosure).

**Example messages:**
- "Explain how Kubernetes works"
- "What is a VLAN?"
- "Walk me through how TLS handshakes work"
- "Give me a crash course on OAuth"

**Key triggers:** explain, how does, what is, teach me, understand, learn, tutorial, guide, concept, fundamentals, basics, deep dive, research

---

### 17. General

**Icon:** :speech_balloon: &nbsp; **Threshold:** 0 (fallback)

Used when no other domain qualifies. Applies balanced, general-purpose thinking traits.

**Example messages:**
- "Hello"
- "How are you?"
- "Thanks"

No specific keywords — this is the catch-all when a message is too short or generic to classify.

---

## Scoring Details

| Parameter | Value |
|-----------|-------|
| Keyword match weight | 0.20 per keyword |
| Pattern match weight | 0.25 per pattern |
| Default threshold | 0.35 |
| Crisis threshold | 0.30 (lower for urgency) |

**Detection is case-insensitive.** Both keywords and patterns use substring matching against the lowercase message.

**When multiple domains qualify**, the one with the highest total score wins. Ties are resolved by evaluation order (security > engineering > architecture > debugging > ... > learning).

**The correction learning system** tracks when users manually override the detected domain. After 3+ corrections for the same pattern, the system automatically applies the learned correction for future messages.

## Overriding Detection

In the chat UI, each assistant message with Architect metadata shows a context indicator (e.g., "Engineering"). Click the **edit button** next to it to:

- **Override for this message** — changes the displayed domain and records a correction for the learning engine
- **Override for this conversation** — locks the domain for all subsequent messages in this chat (shown as a banner at the top)

Click "Tap to unlock" on the banner to clear a conversation-level override.
