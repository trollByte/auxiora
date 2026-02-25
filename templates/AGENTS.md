# Agent Capabilities

This file defines the tools and agentic behaviors available to Auxiora.

## Available Tools

### 1. Bash Execution
Execute shell commands with user approval.

**Capabilities:**
- Run scripts and CLI tools
- File system operations
- System diagnostics
- Git operations

**Safety Measures:**
- Commands requiring approval: file deletion, network operations, package installation
- Timeout limits (60 seconds default)
- Output truncation (prevent memory exhaustion)
- Working directory restrictions

**Example:**
```bash
# Check disk usage
df -h

# Search for files
find . -name "*.log" -mtime +7

# Run tests
npm test
```

---

### 2. Web Access (Planned)
Fetch web pages and APIs.

**Capabilities:**
- HTTP GET/POST requests
- HTML parsing
- API integration
- RSS feed monitoring

**Safety Measures:**
- Rate limiting per domain
- User-agent identification
- Timeout enforcement
- No credential leakage in URLs

---

### 3. File Operations (Planned)
Read, write, and analyze files within the workspace.

**Capabilities:**
- Read configuration files
- Generate reports
- Parse logs
- Create documentation

**Safety Measures:**
- Workspace-only access by default
- No binary execution from workspace
- File size limits

---

### 4. Scheduled Tasks (Planned)
Cron-like scheduled execution.

**Capabilities:**
- Daily summaries
- Periodic health checks
- Scheduled reminders
- Automated reports

**Example:**
```yaml
schedules:
  - name: "Daily Standup Reminder"
    cron: "0 9 * * 1-5"  # 9 AM weekdays
    action: "Send message: Time for standup!"

  - name: "Weekend Summary"
    cron: "0 18 * * 5"  # 6 PM Friday
    action: "Summarize week's activity"
```

---

### 5. Webhooks (Planned)
Listen for external events.

**Capabilities:**
- GitHub webhook handling
- Custom API endpoints
- Third-party integrations

**Example:**
```yaml
webhooks:
  - path: "/hooks/github"
    event: "push"
    action: "Notify: New commit to ${repo}"

  - path: "/hooks/monitoring"
    event: "alert"
    action: "Investigate: ${alert.message}"
```

---

## Tool Permission Model

### Auto-Approved
These actions execute without prompts:
- Read-only file operations
- HTTP GET requests to known domains
- Non-destructive bash commands (ls, cat, grep, etc.)

### User Approval Required
These actions require explicit confirmation:
- File writes/deletes
- HTTP POST/PUT/DELETE
- Package installation
- Network-exposed services
- Commands with `sudo`

### Always Denied
These are never executed:
- `rm -rf /` or similar destructive patterns
- Credential exposure
- Malicious payloads
- Unauthorized data exfiltration

---

## Extending Agents

To add custom tools, create a plugin in `~/.auxiora/workspace/plugins/`:

```typescript
// Example: custom-tool.ts
export interface CustomTool {
  name: string;
  execute: (params: any) => Promise<any>;
  requiresApproval: boolean;
}

export const weatherTool: CustomTool = {
  name: "get-weather",
  execute: async ({ location }) => {
    const response = await fetch(`https://api.weather.com/${location}`);
    return response.json();
  },
  requiresApproval: false,
};
```

---

**Note:** Tool capabilities are actively being developed. Check the GitHub repository for the latest features.
