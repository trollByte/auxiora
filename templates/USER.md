# User Preferences

This file tells Auxiora about you — your preferences, workflows, and context.

## About You

**Name:** [Your name or alias]
**Timezone:** [e.g., America/Los_Angeles, UTC]
**Pronouns:** [e.g., they/them, she/her, he/him]

## Work Context

**Role:** [e.g., Software Engineer, Data Scientist, System Administrator]
**Primary Languages:** [e.g., TypeScript, Python, Rust]
**Frameworks:** [e.g., React, FastAPI, Kubernetes]
**Tools:** [e.g., VS Code, Neovim, Docker]

## Communication Preferences

**Tone:** [e.g., Professional, Casual, Technical]
**Verbosity:** [e.g., Concise, Detailed, Balanced]
**Code Style:** [e.g., Functional, Object-oriented, Idiomatic]

## Workflows

### Development
- **Editor:** [e.g., VS Code with Vim bindings]
- **Version Control:** [e.g., Git with conventional commits]
- **Testing:** [e.g., Jest, pytest, prefer TDD]
- **CI/CD:** [e.g., GitHub Actions, GitLab CI]

### Infrastructure
- **Cloud Provider:** [e.g., AWS, GCP, Self-hosted]
- **Container Runtime:** [e.g., Docker, Podman]
- **Orchestration:** [e.g., Kubernetes, Docker Compose]

### Messaging
- **Primary Channel:** [e.g., Discord, Telegram, Slack]
- **Notification Hours:** [e.g., 9 AM - 6 PM PST, weekdays only]
- **DND Mode:** [e.g., Enabled during focus blocks]

## Proactive Behaviors (Examples)

```yaml
# Daily standup reminder
- schedule: "0 9 * * 1-5"
  action: "Ask: What are you working on today?"

# End-of-day summary
- schedule: "0 17 * * 1-5"
  action: "Summarize: Today's commits and completed tasks"

# Weekend check-in
- schedule: "0 10 * * 6"
  action: "Ask: Any weekend projects you'd like help with?"
```

## Personal Context

### Current Projects
- [Project 1 description]
- [Project 2 description]

### Goals
- [Short-term goal]
- [Long-term goal]

### Pain Points
- [Thing you want automated]
- [Repetitive task you'd like help with]

---

**Note:** This file is **private** and never leaves your machine. Be as detailed as you like—the more context Auxiora has, the better it can assist you.
