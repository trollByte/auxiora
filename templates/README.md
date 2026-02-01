# Personality Templates

These files define Auxiora's personality, capabilities, and understanding of your context.

## Quick Setup

Copy these templates to your workspace directory:

```bash
# Create workspace directory
mkdir -p ~/.auxiora/workspace

# Copy templates
cp templates/*.md ~/.auxiora/workspace/

# Edit to personalize
$EDITOR ~/.auxiora/workspace/USER.md
```

## File Descriptions

### `SOUL.md` (Required)
Defines Auxiora's core personality, principles, and interaction style.

**Customize this if you want:**
- Different tone (more formal, more casual, technical-only)
- Specific domain expertise emphasis
- Custom ethical boundaries
- Unique behavioral quirks

### `AGENTS.md` (Optional)
Documents available tools and agent capabilities.

**Customize this if you:**
- Build custom tool integrations
- Want specific auto-approval rules
- Add domain-specific agents (e.g., CI/CD monitoring, home automation)

### `IDENTITY.md` (Optional)
Describes the system-level operational context.

**Customize this if you:**
- Deploy in specific environments (corporate, personal, research)
- Have custom security requirements
- Want to document infrastructure details

### `USER.md` (Optional, but recommended)
Your personal preferences and context.

**Why customize this:**
- Auxiora will understand your workflows better
- Code suggestions match your style
- Communication aligns with your preferences
- Proactive behaviors fit your schedule

## Personality Examples

### Minimal (Default)
Just use `SOUL.md` with default values. Good for general-purpose assistance.

### Developer-Focused
Edit `SOUL.md` to emphasize:
- Code review and debugging
- System architecture discussions
- CI/CD pipeline management

Edit `USER.md` to include:
- Your tech stack
- Preferred coding patterns
- Current projects

### Research Assistant
Edit `SOUL.md` to emphasize:
- Citation accuracy
- Literature review
- Data analysis
- Paper summaries

Edit `USER.md` to include:
- Research domain
- Key papers/references
- Active experiments

### Operations/SRE
Edit `SOUL.md` to emphasize:
- Incident response
- Log analysis
- Monitoring and alerting
- Infrastructure automation

Edit `AGENTS.md` to add:
- Custom monitoring webhooks
- Alert escalation rules
- Runbook references

## Privacy Note

**These files NEVER leave your machine.** They're injected into the system prompt locally before messages are sent to AI providers. Your personal context stays private.

## Advanced: Multiple Personalities

You can swap personality files for different contexts:

```bash
# Work persona
cp ~/.auxiora/personalities/work-SOUL.md ~/.auxiora/workspace/SOUL.md

# Personal projects persona
cp ~/.auxiora/personalities/personal-SOUL.md ~/.auxiora/workspace/SOUL.md

# Research persona
cp ~/.auxiora/personalities/research-SOUL.md ~/.auxiora/workspace/SOUL.md
```

Or automate with a script:

```bash
#!/bin/bash
# switch-persona.sh
PERSONA=$1
cp ~/.auxiora/personalities/${PERSONA}-*.md ~/.auxiora/workspace/
sudo systemctl restart auxiora  # Reload with new personality
```

---

**Next Steps:**
1. Copy templates to `~/.auxiora/workspace/`
2. Edit `USER.md` with your preferences
3. Restart Auxiora: `auxiora start`
4. Chat with your personalized assistant!
