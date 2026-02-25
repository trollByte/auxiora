/**
 * BashTool - Execute shell commands with sandboxing
 *
 * NOTE: This tool intentionally uses child_process.exec (not execFile)
 * because it is a shell executor by design — users provide shell commands
 * that require shell interpretation (pipes, redirects, globs, etc.).
 * Security relies on:
 * - Dangerous command pattern detection (rm -rf, sudo, etc.)
 * - Timeout enforcement
 * - Output truncation
 * - Working directory restrictions
 * - Trust level gating (only available at appropriate trust levels)
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'node:path';
import type { Tool, ToolParameter, ExecutionContext, ToolResult } from './index.js';
import { ToolPermission } from './index.js';
import { getLogger } from '@auxiora/logger';

const execAsync = promisify(exec);
const logger = getLogger('tools:bash');

const MAX_OUTPUT_LENGTH = 100000; // 100KB
const DEFAULT_TIMEOUT = 30000; // 30 seconds

/**
 * Dangerous command patterns that should always be denied
 */
const DANGEROUS_PATTERNS = [
  /rm\s+(-rf?|--recursive)\s+(\/|~|\$HOME)/i, // rm -rf /
  /dd\s+if=\/dev\/(zero|random|urandom)/i, // dd if=/dev/zero
  /:\(\)\s*\{.*:\|:.*\};\s*:/i, // Fork bomb
  /mkfs/i, // Format filesystem
  /chmod\s+[0-7]{3,4}\s+(\/|~)/i, // chmod on root
  /chown\s+.*\s+(\/|~)/i, // chown on root
  /sudo/i, // Privilege escalation
  /su\s+/i, // Switch user
  /shutdown/i, // System shutdown
  /reboot/i, // System reboot
  /init\s+[0-6]/i, // Change runlevel
  /passwd/i, // Change passwords
  /userdel/i, // Delete users
  /killall/i, // Kill all processes
  /kill\s+-9\s+1/i, // Kill init
];

/**
 * Commands that require user approval
 */
const APPROVAL_REQUIRED_PATTERNS = [
  /git\s+push/i,
  /git\s+commit/i,
  /npm\s+(install|publish|uninstall)/i,
  /pip\s+(install|uninstall)/i,
  /yarn\s+(add|remove)/i,
  /pnpm\s+(add|remove|install)/i,
  /rm\s+/i, // Any rm command
  /mv\s+/i, // Move files
  /cp\s+.*>/i, // Copy with redirect
  />\s*[^&]/i, // File redirect (write)
  /curl.*-X\s+(POST|PUT|DELETE|PATCH)/i, // HTTP mutations
  /wget.*--post/i,
  /docker\s+(rm|kill|stop)/i,
  /systemctl\s+(stop|restart|disable)/i,
];

/**
 * Safe read-only commands that can be auto-approved
 */
const SAFE_PATTERNS = [
  /^ls(\s|$)/i,
  /^cat\s+/i,
  /^head\s+/i,
  /^tail\s+/i,
  /^grep\s+/i,
  /^find\s+/i,
  /^wc\s+/i,
  /^pwd$/i,
  /^whoami$/i,
  /^date$/i,
  /^echo\s+/i,
  /^git\s+status/i,
  /^git\s+log/i,
  /^git\s+diff/i,
  /^git\s+show/i,
  /^git\s+branch/i,
  /^npm\s+list/i,
  /^node\s+--version/i,
  /^python\s+--version/i,
  /^df\s+-h/i,
  /^ps\s+/i,
  /^top\s+-n\s+1/i,
  /^env$/i,
];

/**
 * Check if command is dangerous
 */
function isDangerous(command: string): boolean {
  return DANGEROUS_PATTERNS.some((pattern) => pattern.test(command));
}

/**
 * Check if command requires approval
 */
function requiresApproval(command: string): boolean {
  // Always deny dangerous commands
  if (isDangerous(command)) {
    return false; // Will be denied, not asked for approval
  }

  // Auto-approve safe commands
  if (SAFE_PATTERNS.some((pattern) => pattern.test(command))) {
    return false;
  }

  // Check if it needs approval
  return APPROVAL_REQUIRED_PATTERNS.some((pattern) => pattern.test(command));
}

/**
 * Determine permission level for command
 */
function getCommandPermission(command: string): ToolPermission {
  if (isDangerous(command)) {
    return ToolPermission.ALWAYS_DENY;
  }

  if (requiresApproval(command)) {
    return ToolPermission.USER_APPROVAL;
  }

  return ToolPermission.AUTO_APPROVE;
}

/**
 * Truncate output if too long
 */
function truncateOutput(output: string, maxLength: number = MAX_OUTPUT_LENGTH): string {
  if (output.length <= maxLength) {
    return output;
  }

  const truncated = output.substring(0, maxLength);
  return truncated + `\n\n[... output truncated (${output.length - maxLength} bytes omitted)]`;
}

/**
 * BashTool - Execute bash commands
 */
export const BashTool: Tool = {
  name: 'bash',
  description: 'Execute shell commands. Use this to run terminal commands, check files, run scripts, etc.',

  parameters: [
    {
      name: 'command',
      type: 'string',
      description: 'The shell command to execute',
      required: true,
    },
    {
      name: 'workingDir',
      type: 'string',
      description: 'Working directory for the command (optional)',
      required: false,
    },
  ] as ToolParameter[],

  validateParams(params: any): string | null {
    if (!params.command || typeof params.command !== 'string') {
      return 'command must be a non-empty string';
    }

    if (params.command.trim().length === 0) {
      return 'command cannot be empty';
    }

    if (params.workingDir && typeof params.workingDir !== 'string') {
      return 'workingDir must be a string';
    }

    return null;
  },

  getPermission(params: any, context: ExecutionContext): ToolPermission {
    return getCommandPermission(params.command);
  },

  async execute(params: any, context: ExecutionContext): Promise<ToolResult> {
    const { command, workingDir } = params;
    const timeout = context.timeout || DEFAULT_TIMEOUT;

    logger.info('Executing bash command', { command, workingDir, timeout });

    try {
      // Determine working directory
      const cwd = workingDir
        ? path.resolve(workingDir)
        : context.workingDirectory || process.cwd();

      // Execute command with timeout
      const { stdout, stderr } = await execAsync(command, {
        cwd,
        timeout,
        maxBuffer: MAX_OUTPUT_LENGTH,
        env: {
          ...process.env,
          ...context.environment,
        },
      });

      const output = stdout + (stderr ? `\n[stderr]\n${stderr}` : '');
      const truncated = truncateOutput(output);

      logger.info('Bash command completed successfully', {
        command,
        outputLength: output.length,
        truncated: output.length > MAX_OUTPUT_LENGTH,
      });

      return {
        success: true,
        output: truncated,
        metadata: {
          command,
          workingDir: cwd,
          outputLength: output.length,
          truncated: output.length > MAX_OUTPUT_LENGTH,
        },
      };
    } catch (error: any) {
      logger.error('Bash command failed', { command, error: error.message });

      // Handle timeout
      if (error.killed && error.signal === 'SIGTERM') {
        return {
          success: false,
          error: `Command timed out after ${timeout}ms`,
          metadata: { command, timeout, killed: true },
        };
      }

      // Handle other errors
      const output = error.stdout || '';
      const stderr = error.stderr || '';
      const combined = output + (stderr ? `\n[stderr]\n${stderr}` : '');

      return {
        success: false,
        output: truncateOutput(combined),
        error: error.message,
        metadata: {
          command,
          exitCode: error.code,
          signal: error.signal,
        },
      };
    }
  },
};

/**
 * Export helper functions for testing
 */
export { isDangerous, requiresApproval, getCommandPermission, truncateOutput };
