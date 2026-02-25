# Personality System

> Two engines: SOUL.md for fine-grained tone control, The Architect for context-aware intelligence.

Auxiora ships with two complementary personality systems. **SOUL.md** gives you direct control over tone, interaction mode, and boundaries through a simple markdown file. **The Architect** is a context-aware engine that dynamically blends 29 traits drawn from documented historical figures, adapting its thinking and communication style to the domain of each conversation.

You can use either system independently or layer them together.

---

## SOUL.md (Classic)

SOUL.md is a markdown file with YAML frontmatter that defines the assistant's baseline personality. It controls tone, interaction mode, catchphrases, expertise areas, and hard boundaries.

### Tone Controls

Four numeric parameters (0.0 to 1.0) set the assistant's communication style:

| Parameter | Range | Low End | High End |
|-----------|-------|---------|----------|
| Warmth | 0-1 | Cold, clinical | Warm, friendly |
| Directness | 0-1 | Diplomatic, hedging | Blunt, decisive |
| Humor | 0-1 | Serious, professional | Playful, witty |
| Formality | 0-1 | Casual, conversational | Formal, structured |

The default SOUL.md ships with warmth at 0.7, directness at 0.6, humor at 0.3, and formality at 0.5 -- a professional but approachable baseline.

### Interaction Modes

Eight built-in modes shift the assistant's behavior for different contexts:

| Mode | Description | When to Use |
|------|-------------|-------------|
| Operator | Execute commands and tasks efficiently | System administration, automation |
| Analyst | Data-driven reasoning, structured output | Research, data analysis, reporting |
| Advisor | Balanced recommendations with trade-offs | Strategic decisions, consulting |
| Writer | Creative expression, polished prose | Content creation, documentation |
| Socratic | Asks probing questions, guides discovery | Learning, teaching, self-reflection |
| Legal | Cautious, precise, caveat-aware | Compliance, risk assessment, contracts |
| Roast | Playful, sharp, self-deprecating wit | Humor, morale, team bonding |
| Companion | Warm, patient, emotionally attuned | Personal support, casual conversation |

### Personality Files

Four markdown files in `~/.auxiora/workspace/` define the assistant's complete identity:

| File | Purpose |
|------|---------|
| **SOUL.md** | Core personality: tone, mode, catchphrases, expertise, boundaries |
| **USER.md** | Your preferences: name, timezone, work context, communication style, workflows, goals |
| **AGENTS.md** | Available tools and capabilities: bash execution, web access, file operations, scheduled tasks |
| **IDENTITY.md** | System-level identity: deployment info, security posture, data handling policies |

**Editing:** All four files are plain markdown. Edit them directly with any text editor, or use the dashboard's Settings pages. Changes take effect on the next conversation turn.

**SOUL.md frontmatter example:**

```yaml
---
id: default
name: Auxiora Default
tone:
  warmth: 0.7
  directness: 0.6
  humor: 0.3
  formality: 0.5
expertise: []
errorStyle: professional
boundaries:
  neverJokeAbout: []
  neverAdviseOn: [medical, legal, financial]
---
```

---

## The Architect

The Architect is Auxiora's advanced personality engine. It detects the context of each conversation, selects appropriate traits from a library of 29 documented behavioral instincts, and assembles a tailored prompt -- all transparently.

### How It Works

The Architect runs a five-stage pipeline on every message:

```
Context Detection --> Correction Learning --> Emotional Tracking --> Trait Mixing --> Prompt Assembly
```

1. **Context Detection** -- Analyzes the conversation to identify which of 17 domains applies (e.g., security review, code engineering, negotiation). Uses keyword density matching; requires approximately 5 domain-specific keywords for high confidence.

2. **Correction Learning** -- Records when the detected domain was wrong and the user corrected it. Over time, these corrections improve future detection accuracy.

3. **Emotional Tracking** -- Monitors the emotional tone of the conversation. Detects escalation, frustration, or satisfaction and adjusts tone modifiers accordingly.

4. **Trait Mixing** -- Selects a context profile (29 trait weights tuned for the detected domain) and applies four layers of modification:
   - Base context profile for the domain
   - Emotional overrides based on current conversation mood
   - Custom weight offsets (user preferences, presets)
   - History-aware resolution (recency-weighted, with 0.8 decay factor and 30-day age decay)

5. **Prompt Assembly** -- Converts the final trait mix into concrete behavioral instructions and assembles the system prompt. Only traits above threshold contribute instructions.

### 29 Traits with Provenance

Every trait in The Architect traces to documented behavior from historical figures. Nothing is invented.

#### Thinking Traits

| Trait | Source Mind | Behavioral Focus |
|-------|-----------|-----------------|
| Inversion | Charlie Munger | Define failure first, then prevent it |
| First Principles | Elon Musk / Isaac Newton | Decompose to ground truth, rebuild from atoms |
| Mental Simulation | Nikola Tesla | Run solutions forward in time, find break points |
| Adversarial Thinking | Andrew Grove / Sun Tzu | Think like the attacker, defend the cheapest attack |
| Second-Order Effects | Howard Marks | Ask "then what?" at least twice for every decision |
| Systems View | Buckminster Fuller / Claude Shannon | See the whole system before optimizing components |

#### Communication Traits

| Trait | Source Mind | Behavioral Focus |
|-------|-----------|-----------------|
| Simplification | Steve Jobs / Claude Shannon | Simplify until a sharp 12-year-old understands |
| Storytelling | Robert Cialdini | Tell stories before making arguments |
| Tactical Empathy | Chris Voss | Label emotions, mirror, ask calibrated questions |
| Genuine Curiosity | Dale Carnegie | Ask genuine questions, listen to understand |
| Radical Candor | Kim Scott | Care personally AND challenge directly |

#### Leadership Traits

| Trait | Source Mind | Behavioral Focus |
|-------|-----------|-----------------|
| Standard Setting | John Wooden / Bill Walsh | Define "good" in granular detail, lead by example |
| Developmental Coaching | John Wooden | High expectations paired with patient instruction |
| Strategic Generosity | Adam Grant / Benjamin Franklin | Give first, give often, protect your energy |
| Stoic Calm | Marcus Aurelius | Absorb without reacting, reframe obstacles |
| Paranoid Vigilance | Andrew Grove | Treat complacency as the primary threat |

#### Execution Traits

| Trait | Source Mind | Behavioral Focus |
|-------|-----------|-----------------|
| Value Equation | Alex Hormozi | Maximize outcome and likelihood, minimize time and effort |
| OODA Loop | John Boyd | Observe-Orient-Decide-Act faster than the competition |
| Build for Change | Martin Fowler / Kent Beck | Optimize for adaptability, make being wrong cheap |
| Human-Centered Design | Don Norman | Every moment of friction is your feedback |
| Constraint Creativity | Charles Eames | Treat constraints as creative fuel |

#### Decision Traits

| Trait | Source Mind | Behavioral Focus |
|-------|-----------|-----------------|
| Regret Minimization | Jeff Bezos | Project to age 80 -- will you regret not trying? |
| Door Classification | Jeff Bezos | One-way doors need care; two-way doors need speed |
| Probabilistic Thinking | Annie Duke | Assign probabilities, separate decision quality from outcomes |
| Planned Abandonment | Peter Drucker | If you would not start it today, stop it |

#### Tone Modifiers

| Trait | Calibration | Behavioral Focus |
|-------|------------|-----------------|
| Warmth | Composite (Wooden, Carnegie, Voss vs. Grove, Aurelius) | Emotional temperature of communication |
| Urgency | Composite (Boyd, Grove vs. Aurelius, Wooden) | Pace pressure and action bias |
| Humor | Composite (Franklin, Munger vs. crisis gravity) | Levity, dry wit, self-deprecation |
| Verbosity | Composite (Jobs, Boyd vs. Marks, Drucker) | Response depth and reasoning detail |

### 17 Domains

The Architect recognizes 17 conversational domains, each with a tuned trait profile:

| Domain | Primary Emphasis |
|--------|-----------------|
| Security Review | Adversarial thinking, paranoid vigilance, inversion |
| Code Engineering | First principles, simplification, build for change |
| Architecture Design | Systems view, first principles, door classification |
| Debugging | Mental simulation, OODA loops, curiosity |
| Team Leadership | Standard setting, coaching, radical candor, empathy |
| One-on-One | Tactical empathy, curiosity, coaching, warmth |
| Sales Pitch | Value equation, storytelling, simplification |
| Negotiation | Tactical empathy, mental simulation, stoic calm |
| Marketing | Storytelling, simplification, human-centered design |
| Strategic Planning | Inversion, second-order effects, probabilistic thinking |
| Crisis Management | Stoic calm, OODA loops, radical candor, zero humor |
| Creative Work | Constraint creativity, curiosity, storytelling |
| Writing | Simplification, storytelling, human-centered design |
| Decision Making | Inversion, regret minimization, door classification, probabilistic |
| Learning & Research | First principles, simplification, curiosity |
| Personal Development | Coaching, radical candor, empathy, warmth |
| General | Balanced baseline with gentle emphasis on clarity and curiosity |

### 5 Presets

Presets apply additive offsets (clamped to +/-0.3) on top of domain profiles. They shift the personality toward a specific archetype without overriding context detection.

| Preset | Focus | Best For |
|--------|-------|----------|
| **The CISO** | +Adversarial thinking, +paranoid vigilance, +inversion, -humor, -warmth | Security reviews, audit prep, threat modeling |
| **The Builder** | +Value equation, +OODA, +build for change, +constraint creativity, -verbosity | Feature development, MVPs, shipping fast |
| **The Coach** | +Tactical empathy, +coaching, +curiosity, +warmth, -urgency, -adversarial | 1:1s, mentoring, personal development |
| **The Strategist** | +Inversion, +second-order, +probabilistic, +door classification, +verbosity | Strategic planning, architecture decisions |
| **The Closer** | +Value equation, +storytelling, +simplification, +urgency, +humor | Pitches, negotiations, proposals |

**Applying a preset:**

```bash
auxiora personality set architect --preset the_builder
```

Or via the dashboard: Settings > Architect > Presets.

### Custom Weights

Beyond presets, you can set individual trait offsets to fine-tune the personality:

- Offsets range from -0.3 to +0.3
- Applied additively after context profiles and emotional overrides
- Final trait values are clamped to [0.0, 1.0]

Custom weights can be configured through the dashboard (Settings > Architect > Custom Weights) or serialized/deserialized for sharing between instances.

### Transparency

The Architect is fully transparent about its reasoning. Every response can show:

- **Active domain** -- Which of the 17 domains was detected
- **Active traits** -- Which traits are contributing and at what weight
- **Trait provenance** -- The historical source and behavioral instruction for each active trait
- **Emotional state** -- Current conversation mood and any emotional overrides

This information is available through the transparency footer in the web dashboard (click "Why?" on any response) and through the Architect metadata in the API response.

### Self-Awareness (User Model)

The Architect builds a model of you over time through four self-awareness modules:

- **PreferenceHistory** -- Tracks preference changes over time with conflict detection and recency-weighted resolution (0.8 decay factor, 30-day age decay)
- **DecisionLog** -- Records cross-session decisions with follow-up dates, tag extraction, and querying
- **FeedbackStore** -- Converts ratings into trait suggestions (e.g., 5+ "too verbose" signals triggers a verbosity reduction)
- **CorrectionStore** -- Learns from domain detection mistakes to improve future accuracy

The **UserModelSynthesizer** aggregates all four stores into a unified `UserModel` containing:

- Top domains by usage with satisfaction rates
- Communication style preferences (verbosity, warmth, humor)
- Satisfaction trends (improving, declining, stable)
- Active decisions and upcoming follow-ups
- Preference conflicts and correction patterns

The User Model is available through the "About Me" page in the dashboard (`TheArchitect.getUserModel()`). It is opt-in and explicit -- never injected into prompts without your knowledge.

---

## Use Cases

### 1. Code Review

The Architect detects the "code engineering" domain and activates first-principles analysis, adversarial thinking, and build-for-change instincts. It checks for edge cases (Munger's inversion), questions assumptions about the architecture (Musk's first principles), and evaluates whether the code is easy to change later (Fowler/Beck). Apply "The CISO" preset for security-focused reviews that add paranoid vigilance and threat modeling.

### 2. Crisis Communication

Emotional tracking detects escalation in the conversation. The engine shifts to crisis management mode: maximum stoic calm (Aurelius), rapid OODA cycles (Boyd), radical candor (Scott), and zero humor. It helps draft clear, decisive incident communications that acknowledge the situation without hedging.

### 3. Sales Prep

Load "The Closer" preset for pitch rehearsal. The value equation (Hormozi) structures the offer around dream outcome and perceived likelihood. Storytelling (Cialdini) frames the narrative. Tactical empathy (Voss) anticipates objections. High urgency and simplification keep the pitch tight and actionable.

### 4. Learning

Use Socratic mode in SOUL.md for question-driven discovery, or "The Coach" preset in The Architect for patient, developmental guidance. First-principles teaching (decompose to fundamentals), simplification (make complex topics accessible), and genuine curiosity (ask questions that deepen understanding) work together to accelerate learning.

---

## Related Documentation

- [Memory System](memory.md) -- How Auxiora remembers and learns about you
- [Dashboard](dashboard.md) -- Web UI for personality configuration
- [CLI Reference](cli.md) -- `auxiora personality` commands
