# Tool System Documentation

The Auxiora tool system allows AI assistants to interact with the real world through sandboxed, permission-controlled tools. This enables powerful agentic behaviors while maintaining security and user control.

## Table of Contents

- [Overview](#overview)
- [Built-in Tools](#built-in-tools)
- [Permission System](#permission-system)
- [Using Tools](#using-tools)
- [Creating Custom Tools](#creating-custom-tools)
- [Architecture](#architecture)
- [Examples](#examples)

## Overview

The tool system provides:

- **Secure Execution**: All tools run with permission checks and sandboxing
- **User Control**: Dangerous operations require user approval
- **Context-Aware**: Tools receive session and user context
- **Provider Integration**: Seamlessly works with Anthropic Claude and OpenAI
- **Extensible**: Easy to add custom tools

### Key Components

1. **ToolRegistry**: Central registry of available tools
2. **ToolExecutor**: Executes tools with permission checking
3. **Built-in Tools**: bash, web_browser, file_read, file_write, file_list
4. **Permission System**: AUTO_APPROVE, USER_APPROVAL, ALWAYS_DENY

## Built-in Tools

### BashTool

Execute shell commands with security sandboxing.

**Name**: `bash`

**Parameters**:
- `command` (string, required): The shell command to execute
- `workingDir` (string, optional): Working directory for the command

**Permission Logic**:
- **Auto-approved**: Safe read-only commands (ls, cat, git status, etc.)
- **User approval**: Mutating operations (git push, npm install, rm, mv, etc.)
- **Always denied**: Dangerous commands (rm -rf /, sudo, fork bombs, etc.)

**Examples**:
```typescript
// Safe command - auto-approved
{ name: 'bash', params: { command: 'ls -la' } }

// Needs approval
{ name: 'bash', params: { command: 'git push origin main' } }

// Always denied
{ name: 'bash', params: { command: 'sudo rm -rf /' } }
```

**Security Features**:
- Command pattern matching for dangerous operations
- Timeout enforcement (30s default)
- Output truncation (100KB max)
- Working directory restrictions

### WebBrowserTool

Fetch and read web pages with HTML to markdown conversion.

**Name**: `web_browser`

**Parameters**:
- `url` (string, required): The URL to fetch
- `method` (string, optional): HTTP method (GET or POST, default: GET)
- `body` (string, optional): Request body for POST requests

**Permission Logic**:
- **Auto-approved**: GET requests
- **User approval**: POST requests

**Features**:
- HTML to markdown conversion
- Rate limiting (10 requests per domain per minute)
- Timeout enforcement (10s default)
- Content length limits (500KB max)
- User-agent identification

**Example**:
```typescript
{
  name: 'web_browser',
  params: {
    url: 'https://example.com',
    method: 'GET'
  }
}
```

### File Operations

Three tools for file system operations:

#### FileReadTool

**Name**: `file_read`

**Parameters**:
- `path` (string, required): Path to file (relative to workspace or absolute)
- `encoding` (string, optional): File encoding (default: utf-8)

**Permission**: AUTO_APPROVE

**Security**:
- Workspace-only access by default
- Path traversal prevention
- Binary file detection
- File size limits (1MB max)

#### FileWriteTool

**Name**: `file_write`

**Parameters**:
- `path` (string, required): Path to file
- `content` (string, required): Content to write
- `encoding` (string, optional): File encoding (default: utf-8)

**Permission**: USER_APPROVAL

**Security**:
- Workspace-only access by default
- Automatic directory creation
- Path traversal prevention

#### FileListTool

**Name**: `file_list`

**Parameters**:
- `path` (string, optional): Directory path (default: current directory)
- `recursive` (boolean, optional): List recursively (default: false)

**Permission**: AUTO_APPROVE

**Security**:
- Workspace-only access
- Result truncation (1000 files max)

**Example**:
```typescript
{
  name: 'file_list',
  params: {
    path: '.',
    recursive: true
  }
}
```

## Permission System

The tool system uses three permission levels:

### AUTO_APPROVE

Tools execute immediately without user confirmation.

**Use for**: Safe, read-only operations
- Reading files
- Listing directories
- Running safe commands (ls, cat, git status)
- Fetching web pages (GET)

### USER_APPROVAL

Tools require explicit user approval before execution.

**Use for**: Operations that modify state
- Writing files
- Running destructive commands (rm, mv)
- Package installations (npm install, pip install)
- Git operations (push, commit)
- POST/PUT/DELETE HTTP requests

### ALWAYS_DENY

Tools are blocked and never execute.

**Use for**: Dangerous operations that should never be allowed
- System-level commands (sudo, su)
- Destructive operations (rm -rf /, mkfs)
- Fork bombs and DoS attacks
- Password changes
- System shutdown/reboot

### Dynamic Permissions

Permissions can be context-aware:

```typescript
getPermission(params: any, context: ExecutionContext): ToolPermission {
  // Allow admins to run without approval
  if (context.userId === 'admin') {
    return ToolPermission.AUTO_APPROVE;
  }

  // Regular users need approval for file writes
  if (params.path.startsWith('/etc/')) {
    return ToolPermission.ALWAYS_DENY;
  }

  return ToolPermission.USER_APPROVAL;
}
```

## Using Tools

### From Runtime

Tools are automatically available when you initialize Auxiora:

```typescript
import { Auxiora } from '@auxiora/runtime';

const auxiora = new Auxiora();
await auxiora.initialize({
  vaultPassword: 'your-password'
});

await auxiora.start();
// Tools are now available to the AI
```

The runtime automatically:
1. Initializes the tool executor with an approval callback
2. Passes tool definitions to the AI provider
3. Handles tool execution requests
4. Returns results to the AI

### Tool Execution Flow

1. **User sends message** to Auxiora
2. **AI receives tool definitions** in the prompt
3. **AI decides to use a tool** and returns tool_use
4. **Runtime checks permissions**:
   - AUTO_APPROVE: Execute immediately
   - USER_APPROVAL: Ask user for confirmation
   - ALWAYS_DENY: Reject with error
5. **Tool executes** with sandboxing and context
6. **Results sent back to AI**
7. **AI continues** with tool results

### Approval Callback

The runtime uses an approval callback for USER_APPROVAL tools:

```typescript
initializeToolExecutor(async (toolName, params, context) => {
  // For now, auto-approve all tools
  // In future: send approval request to client via WebSocket
  console.log(`[Tools] Auto-approving ${toolName}`);
  return true; // or false to deny
});
```

## Creating Custom Tools

### Basic Tool

```typescript
import { Tool, ToolPermission, ExecutionContext, ToolResult } from '@auxiora/tools';

const CalculatorTool: Tool = {
  name: 'calculator',
  description: 'Perform mathematical calculations',

  parameters: [
    {
      name: 'expression',
      type: 'string',
      description: 'Mathematical expression to evaluate (e.g., "2 + 2", "sqrt(16)")',
      required: true,
    },
  ],

  getPermission(params: any, context: ExecutionContext): ToolPermission {
    // Safe operation - auto-approve
    return ToolPermission.AUTO_APPROVE;
  },

  async execute(params: any, context: ExecutionContext): Promise<ToolResult> {
    try {
      // Use a proper math parser library like math.js in production
      // This is a simplified example
      const result = calculateExpression(params.expression);

      return {
        success: true,
        output: `Result: ${result}`,
        metadata: { expression: params.expression, result },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        metadata: { expression: params.expression },
      };
    }
  },
};

// Helper function - use a proper math library in production
function calculateExpression(expr: string): number {
  // Basic validation
  if (!/^[\d\s+\-*/().]+$/.test(expr)) {
    throw new Error('Invalid expression');
  }
  // In production, use a library like math.js
  return Function(`'use strict'; return (${expr})`)();
}
```

### Tool with Validation

```typescript
const EmailTool: Tool = {
  name: 'send_email',
  description: 'Send an email',

  parameters: [
    { name: 'to', type: 'string', description: 'Recipient email', required: true },
    { name: 'subject', type: 'string', description: 'Email subject', required: true },
    { name: 'body', type: 'string', description: 'Email body', required: true },
  ],

  validateParams(params: any): string | null {
    if (!params.to || !params.to.includes('@')) {
      return 'to must be a valid email address';
    }

    if (!params.subject || params.subject.length < 1) {
      return 'subject cannot be empty';
    }

    if (!params.body) {
      return 'body is required';
    }

    return null; // Validation passed
  },

  getPermission(params: any, context: ExecutionContext): ToolPermission {
    // Sending emails requires approval
    return ToolPermission.USER_APPROVAL;
  },

  async execute(params: any, context: ExecutionContext): Promise<ToolResult> {
    // Send email implementation
    // ...

    return {
      success: true,
      output: `Email sent to ${params.to}`,
    };
  },
};
```

### Context-Aware Tool

```typescript
const DatabaseTool: Tool = {
  name: 'database_query',
  description: 'Query the database',

  parameters: [
    { name: 'query', type: 'string', description: 'SQL query', required: true },
  ],

  getPermission(params: any, context: ExecutionContext): ToolPermission {
    // Check if query is read-only
    const query = params.query.toLowerCase();
    if (query.startsWith('select') && !query.includes('into')) {
      return ToolPermission.AUTO_APPROVE;
    }

    // Admin can run write queries
    if (context.userId === 'admin') {
      return ToolPermission.USER_APPROVAL;
    }

    // Regular users cannot run write queries
    return ToolPermission.ALWAYS_DENY;
  },

  async execute(params: any, context: ExecutionContext): Promise<ToolResult> {
    // Execute database query
    // Use context.userId for audit logging
    // Use context.sessionId for tracking
    // ...

    return {
      success: true,
      output: 'Query results',
      metadata: {
        userId: context.userId,
        sessionId: context.sessionId,
        rowsAffected: 0,
      },
    };
  },
};
```

### Registering Custom Tools

```typescript
import { toolRegistry } from '@auxiora/tools';

// Register your custom tool
toolRegistry.register(CalculatorTool);
toolRegistry.register(EmailTool);
toolRegistry.register(DatabaseTool);

// Tool is now available to the AI
```

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────┐
│                        Runtime                          │
│                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
│  │   Gateway   │  │  Providers  │  │   Sessions  │   │
│  └─────────────┘  └─────────────┘  └─────────────┘   │
│         │                │                              │
│         └────────────────┴───────────┐                 │
│                                      ▼                  │
│                            ┌──────────────────┐         │
│                            │  ToolExecutor    │         │
│                            └──────────────────┘         │
│                                      │                  │
│                                      ▼                  │
│                            ┌──────────────────┐         │
│                            │  ToolRegistry    │         │
│                            └──────────────────┘         │
│                                      │                  │
│         ┌────────────────────────────┼────────────┐    │
│         ▼            ▼               ▼            ▼     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │BashTool  │ │ WebTool  │ │FileTool  │ │CustomTool│  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Execution Flow

```
User Message
     │
     ▼
┌─────────────┐
│   Gateway   │
└─────────────┘
     │
     ▼
┌─────────────┐     ┌─────────────┐
│  Provider   │────▶│    Tools    │ (tool definitions)
└─────────────┘     └─────────────┘
     │
     ▼
   AI Response
   (tool_use)
     │
     ▼
┌─────────────┐
│ToolExecutor │
└─────────────┘
     │
     ├─▶ Permission Check
     │
     ├─▶ Validation
     │
     ├─▶ User Approval (if needed)
     │
     ├─▶ Execute Tool
     │
     ▼
   Tool Result
     │
     ▼
┌─────────────┐
│  Provider   │ (continue with result)
└─────────────┘
     │
     ▼
  AI Response
     │
     ▼
   User
```

### Provider Integration

The tool system integrates with AI providers through:

1. **Tool Definitions**: `toolRegistry.toProviderFormat()` converts tools to provider-specific format
2. **Streaming**: Providers yield `tool_use` chunks when AI calls tools
3. **Results**: Tool results are sent back to the AI as additional messages

**Anthropic Example**:
```typescript
// Runtime passes tools to provider
const tools = toolRegistry.toProviderFormat();
const stream = provider.stream(messages, {
  systemPrompt,
  tools, // Anthropic tool format
});

// Provider yields tool_use
for await (const chunk of stream) {
  if (chunk.type === 'tool_use') {
    // Execute tool
    const result = await toolExecutor.execute(
      chunk.toolUse.name,
      chunk.toolUse.input,
      context
    );

    // Send result back to AI
    // ...
  }
}
```

## Examples

### Example 1: Reading and Analyzing a File

**User**: "Read the package.json file and tell me what dependencies we use"

**AI response**:
1. Uses `file_read` tool: `{ path: 'package.json' }`
2. Receives file contents
3. Analyzes dependencies
4. Responds: "You're using these dependencies: ..."

### Example 2: Checking Git Status and Making Changes

**User**: "Check if there are any uncommitted changes and commit them"

**AI response**:
1. Uses `bash` tool: `{ command: 'git status' }` (auto-approved)
2. Sees uncommitted changes
3. Uses `bash` tool: `{ command: 'git add . && git commit -m "Update"' }` (requires approval)
4. Waits for user approval
5. Executes after approval
6. Responds: "Changes committed successfully"

### Example 3: Fetching and Summarizing Web Content

**User**: "What's the latest news from example.com?"

**AI response**:
1. Uses `web_browser` tool: `{ url: 'https://example.com/news', method: 'GET' }` (auto-approved)
2. Receives markdown-converted content
3. Summarizes the news
4. Responds with summary

### Example 4: Multi-Tool Workflow

**User**: "List all .ts files, read the first one, and check if it has any TODOs"

**AI response**:
1. Uses `bash` tool: `{ command: 'find . -name "*.ts"' }` (auto-approved)
2. Receives file list
3. Uses `file_read` tool: `{ path: './src/index.ts' }` (auto-approved)
4. Receives file contents
5. Searches for TODO comments
6. Responds: "Found 3 TODOs in index.ts: ..."

## Best Practices

### Security

1. **Workspace Restrictions**: Always validate paths are within the workspace
2. **Input Validation**: Validate all tool parameters
3. **Rate Limiting**: Implement rate limits for external APIs
4. **Timeout Enforcement**: Set reasonable timeouts for all tools
5. **Output Truncation**: Limit output size to prevent memory issues
6. **Avoid Dynamic Code Execution**: Never use eval() or Function() constructor with user input

### Tool Design

1. **Single Responsibility**: Each tool should do one thing well
2. **Clear Descriptions**: Help the AI understand when to use the tool
3. **Fail Gracefully**: Return useful error messages
4. **Include Metadata**: Provide additional context in results
5. **Context Awareness**: Use execution context for personalization

### Permission Guidelines

- **Read-only operations**: AUTO_APPROVE
- **State mutations**: USER_APPROVAL
- **Dangerous operations**: ALWAYS_DENY
- **Context-sensitive**: Use context to make smart decisions

### Testing

Always test your tools thoroughly:

```typescript
describe('MyCustomTool', () => {
  it('should execute successfully', async () => {
    const result = await MyCustomTool.execute(
      { param: 'value' },
      { userId: 'test' }
    );
    expect(result.success).toBe(true);
  });

  it('should validate parameters', () => {
    const error = MyCustomTool.validateParams({ invalid: 'param' });
    expect(error).toBeTruthy();
  });

  it('should check permissions correctly', () => {
    const permission = MyCustomTool.getPermission(
      { action: 'read' },
      { userId: 'admin' }
    );
    expect(permission).toBe(ToolPermission.AUTO_APPROVE);
  });
});
```

## Troubleshooting

### Tool Not Found

**Error**: `Tool not found: tool_name`

**Solution**: Ensure the tool is registered:
```typescript
import { toolRegistry } from '@auxiora/tools';
toolRegistry.register(MyTool);
```

### Permission Denied

**Error**: `Tool execution denied for security reasons`

**Solution**: The tool has `ALWAYS_DENY` permission. Check the `getPermission` logic.

### Approval Callback Missing

**Error**: `Tool requires approval but no approval callback set`

**Solution**: Initialize the tool executor with a callback:
```typescript
initializeToolExecutor(async (toolName, params, context) => {
  // Return true to approve, false to deny
  return confirm(`Approve ${toolName}?`);
});
```

### Validation Errors

**Error**: `Invalid parameters: ...`

**Solution**: Fix the parameters passed to the tool. Check the tool's parameter definitions.

## Future Enhancements

- **Interactive Approval UI**: WebSocket-based approval requests
- **Tool Chaining**: Allow tools to call other tools
- **Streaming Tool Output**: Stream tool execution progress
- **Tool Marketplace**: Share and discover community tools
- **Sandboxed Execution**: Docker/VM-based isolation
- **Audit Logging**: Detailed logging of all tool executions
- **Tool Analytics**: Track tool usage and performance
