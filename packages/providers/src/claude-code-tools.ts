/**
 * Claude Code tool definitions for OAuth token compatibility.
 *
 * OAuth tokens from Claude Pro/Max are restricted to Claude Code usage.
 * By sending Claude Code's tools with requests, we can use these tokens.
 */

export interface ClaudeCodeTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Claude Code tool names in canonical casing.
 */
export const CLAUDE_CODE_TOOL_NAMES = [
  'Read',
  'Write',
  'Edit',
  'Bash',
  'Grep',
  'Glob',
  'AskUserQuestion',
  'EnterPlanMode',
  'ExitPlanMode',
  'NotebookEdit',
  'Skill',
  'Task',
  'TaskOutput',
  'WebFetch',
  'WebSearch',
] as const;

/**
 * Minimal Claude Code tool definitions.
 * These are simplified versions - just enough for the API to accept the request.
 */
export const CLAUDE_CODE_TOOLS: ClaudeCodeTool[] = [
  {
    name: 'Read',
    description: 'Read a file from the filesystem',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'The path to the file to read' },
        offset: { type: 'number', description: 'Line offset to start reading from' },
        limit: { type: 'number', description: 'Maximum number of lines to read' },
      },
      required: ['file_path'],
    },
  },
  {
    name: 'Write',
    description: 'Write content to a file',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'The path to write to' },
        content: { type: 'string', description: 'The content to write' },
      },
      required: ['file_path', 'content'],
    },
  },
  {
    name: 'Edit',
    description: 'Edit a file by replacing text',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'The path to the file' },
        old_string: { type: 'string', description: 'The text to replace' },
        new_string: { type: 'string', description: 'The replacement text' },
      },
      required: ['file_path', 'old_string', 'new_string'],
    },
  },
  {
    name: 'Bash',
    description: 'Execute a bash command',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The command to execute' },
        timeout: { type: 'number', description: 'Timeout in milliseconds' },
      },
      required: ['command'],
    },
  },
  {
    name: 'Grep',
    description: 'Search for patterns in files',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'The regex pattern to search for' },
        path: { type: 'string', description: 'The directory to search in' },
        glob: { type: 'string', description: 'File glob pattern' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'Glob',
    description: 'Find files matching a pattern',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'The glob pattern' },
        path: { type: 'string', description: 'The base directory' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'AskUserQuestion',
    description: 'Ask the user a question',
    input_schema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question to ask' },
      },
      required: ['question'],
    },
  },
  {
    name: 'EnterPlanMode',
    description: 'Enter planning mode',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'ExitPlanMode',
    description: 'Exit planning mode',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'NotebookEdit',
    description: 'Edit a Jupyter notebook cell',
    input_schema: {
      type: 'object',
      properties: {
        notebook_path: { type: 'string', description: 'Path to the notebook' },
        cell_number: { type: 'number', description: 'Cell number to edit' },
        new_source: { type: 'string', description: 'New cell content' },
      },
      required: ['notebook_path', 'new_source'],
    },
  },
  {
    name: 'Skill',
    description: 'Execute a skill',
    input_schema: {
      type: 'object',
      properties: {
        skill: { type: 'string', description: 'The skill to execute' },
        args: { type: 'string', description: 'Arguments for the skill' },
      },
      required: ['skill'],
    },
  },
  {
    name: 'Task',
    description: 'Launch a task agent',
    input_schema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Task description' },
        prompt: { type: 'string', description: 'The task prompt' },
        subagent_type: { type: 'string', description: 'Type of subagent' },
      },
      required: ['description', 'prompt', 'subagent_type'],
    },
  },
  {
    name: 'TaskOutput',
    description: 'Get output from a background task',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'The task ID' },
        block: { type: 'boolean', description: 'Whether to wait for completion' },
        timeout: { type: 'number', description: 'Timeout in milliseconds' },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'WebFetch',
    description: 'Fetch content from a URL',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to fetch' },
        prompt: { type: 'string', description: 'Prompt for processing the content' },
      },
      required: ['url', 'prompt'],
    },
  },
  {
    name: 'WebSearch',
    description: 'Search the web',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
      },
      required: ['query'],
    },
  },
];

/**
 * Convert a tool name to Claude Code canonical casing.
 */
export function toClaudeCodeToolName(name: string): string {
  const lower = name.toLowerCase();
  for (const ccName of CLAUDE_CODE_TOOL_NAMES) {
    if (ccName.toLowerCase() === lower) {
      return ccName;
    }
  }
  return name;
}
