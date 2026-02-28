/**
 * FileOperationsTool - Read/write/list files
 *
 * Security features:
 * - Workspace-only access by default
 * - Path traversal prevention
 * - File size limits
 * - Binary file detection
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { getWorkspacePath } from '@auxiora/core';
import type { Tool, ToolParameter, ExecutionContext, ToolResult } from './index.js';
import { ToolPermission } from './index.js';
import { getLogger } from '@auxiora/logger';

const logger = getLogger('tools:files');

const MAX_FILE_SIZE = 1000000; // 1MB
const MAX_LIST_FILES = 1000;

/**
 * Check if path is within workspace
 */
function isWithinWorkspace(filePath: string): boolean {
  const workspace = getWorkspacePath();
  const resolved = path.resolve(filePath);
  const relative = path.relative(workspace, resolved);

  // Path is within workspace if it doesn't start with '..'
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * Expand ~ to home directory (Node's path.resolve doesn't do this)
 */
function expandTilde(filePath: string): string {
  if (filePath === '~') return os.homedir();
  if (filePath.startsWith('~/') || filePath.startsWith('~\\')) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return filePath;
}

/**
 * Resolve file path relative to workspace
 */
function resolveFilePath(filePath: string, allowOutsideWorkspace: boolean = false): string {
  const workspace = getWorkspacePath();

  // Expand ~ to home directory before any other resolution
  const expanded = expandTilde(filePath);

  // If path is absolute, check if it's allowed
  if (path.isAbsolute(expanded)) {
    if (!allowOutsideWorkspace && !isWithinWorkspace(expanded)) {
      throw new Error(`Access denied: ${expanded} is outside workspace`);
    }
    return expanded;
  }

  // Resolve relative to workspace
  const resolved = path.resolve(workspace, expanded);

  if (!allowOutsideWorkspace && !isWithinWorkspace(resolved)) {
    throw new Error(`Access denied: ${filePath} resolves to ${resolved} which is outside workspace`);
  }

  return resolved;
}

/**
 * Check if file is binary
 */
async function isBinaryFile(filePath: string): Promise<boolean> {
  try {
    const buffer = await fs.readFile(filePath);
    const sample = buffer.slice(0, 8192); // Check first 8KB

    // Check for null bytes (common in binary files)
    for (let i = 0; i < sample.length; i++) {
      if (sample[i] === 0) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * FileReadTool - Read file contents
 */
export const FileReadTool: Tool = {
  name: 'file_read',
  description: 'Read contents of a file. Use this to read configuration files, code, logs, etc.',

  parameters: [
    {
      name: 'path',
      type: 'string',
      description: 'Path to the file (relative to workspace or absolute)',
      required: true,
    },
    {
      name: 'encoding',
      type: 'string',
      description: 'File encoding (default: utf-8)',
      required: false,
      default: 'utf-8',
    },
  ] as ToolParameter[],

  validateParams(params: any): string | null {
    if (!params.path || typeof params.path !== 'string') {
      return 'path must be a non-empty string';
    }

    return null;
  },

  getPermission(params: any, context: ExecutionContext): ToolPermission {
    // Reading files is generally safe
    return ToolPermission.AUTO_APPROVE;
  },

  async execute(params: any, context: ExecutionContext): Promise<ToolResult> {
    const { path: filePath, encoding = 'utf-8' } = params;

    logger.info('Reading file', { filePath });

    try {
      const resolved = resolveFilePath(filePath, context.environment?.ALLOW_OUTSIDE_WORKSPACE === 'true');

      // Check if file exists
      const stats = await fs.stat(resolved);

      if (!stats.isFile()) {
        return {
          success: false,
          error: 'Path is not a file',
          metadata: { path: filePath, resolved },
        };
      }

      // Check file size
      if (stats.size > MAX_FILE_SIZE) {
        return {
          success: false,
          error: `File too large (${stats.size} bytes, max ${MAX_FILE_SIZE})`,
          metadata: { path: filePath, size: stats.size, maxSize: MAX_FILE_SIZE },
        };
      }

      // Check if binary
      if (await isBinaryFile(resolved)) {
        return {
          success: false,
          error: 'File appears to be binary (cannot read as text)',
          metadata: { path: filePath, binary: true },
        };
      }

      // Read file
      const content = await fs.readFile(resolved, encoding as BufferEncoding);

      logger.info('File read successfully', { filePath, size: content.length });

      return {
        success: true,
        output: content,
        metadata: {
          path: filePath,
          resolved,
          size: content.length,
          encoding,
        },
      };
    } catch (error: any) {
      logger.error('Failed to read file', { filePath, error: error.message });

      return {
        success: false,
        error: error.message,
        metadata: { path: filePath },
      };
    }
  },
};

/**
 * FileWriteTool - Write file contents
 */
export const FileWriteTool: Tool = {
  name: 'file_write',
  description: 'Write contents to a file. Use this to create or modify files.',

  parameters: [
    {
      name: 'path',
      type: 'string',
      description: 'Path to the file (relative to workspace or absolute)',
      required: true,
    },
    {
      name: 'content',
      type: 'string',
      description: 'Content to write to the file',
      required: true,
    },
    {
      name: 'encoding',
      type: 'string',
      description: 'File encoding (default: utf-8)',
      required: false,
      default: 'utf-8',
    },
  ] as ToolParameter[],

  validateParams(params: any): string | null {
    if (!params.path || typeof params.path !== 'string') {
      return 'path must be a non-empty string';
    }

    if (params.content === undefined || typeof params.content !== 'string') {
      return 'content must be a string';
    }

    return null;
  },

  getPermission(params: any, context: ExecutionContext): ToolPermission {
    // Writing files requires approval
    return ToolPermission.USER_APPROVAL;
  },

  async execute(params: any, context: ExecutionContext): Promise<ToolResult> {
    const { path: filePath, content, encoding = 'utf-8' } = params;

    logger.info('Writing file', { filePath, size: content.length });

    try {
      const resolved = resolveFilePath(filePath, context.environment?.ALLOW_OUTSIDE_WORKSPACE === 'true');

      // Ensure directory exists
      const dir = path.dirname(resolved);
      await fs.mkdir(dir, { recursive: true });

      // Write file
      await fs.writeFile(resolved, content, encoding as BufferEncoding);

      logger.info('File written successfully', { filePath, size: content.length });

      return {
        success: true,
        output: `File written: ${filePath} (${content.length} bytes)`,
        metadata: {
          path: filePath,
          resolved,
          size: content.length,
          encoding,
        },
      };
    } catch (error: any) {
      logger.error('Failed to write file', { filePath, error: error.message });

      return {
        success: false,
        error: error.message,
        metadata: { path: filePath },
      };
    }
  },
};

/**
 * FileListTool - List files in directory
 */
export const FileListTool: Tool = {
  name: 'file_list',
  description: 'List files in a directory. Use this to explore directory contents.',

  parameters: [
    {
      name: 'path',
      type: 'string',
      description: 'Path to directory (relative to workspace or absolute)',
      required: false,
      default: '.',
    },
    {
      name: 'recursive',
      type: 'boolean',
      description: 'List files recursively',
      required: false,
      default: false,
    },
  ] as ToolParameter[],

  validateParams(params: any): string | null {
    if (params.path && typeof params.path !== 'string') {
      return 'path must be a string';
    }

    return null;
  },

  getPermission(params: any, context: ExecutionContext): ToolPermission {
    // Listing files is safe
    return ToolPermission.AUTO_APPROVE;
  },

  async execute(params: any, context: ExecutionContext): Promise<ToolResult> {
    const { path: dirPath = '.', recursive = false } = params;

    logger.info('Listing files', { dirPath, recursive });

    try {
      const resolved = resolveFilePath(dirPath, context.environment?.ALLOW_OUTSIDE_WORKSPACE === 'true');

      // Check if directory exists
      const stats = await fs.stat(resolved);

      if (!stats.isDirectory()) {
        return {
          success: false,
          error: 'Path is not a directory',
          metadata: { path: dirPath, resolved },
        };
      }

      // List files
      const files: string[] = [];

      async function listDir(dir: string, prefix = '') {
        if (files.length >= MAX_LIST_FILES) {
          return; // Stop if we've listed too many files
        }

        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (files.length >= MAX_LIST_FILES) {
            break;
          }

          const relativePath = path.join(prefix, entry.name);
          const fullPath = path.join(dir, entry.name);

          if (entry.isFile()) {
            const stats = await fs.stat(fullPath);
            files.push(`${relativePath} (${stats.size} bytes)`);
          } else if (entry.isDirectory()) {
            files.push(`${relativePath}/`);

            if (recursive) {
              await listDir(fullPath, relativePath);
            }
          }
        }
      }

      await listDir(resolved);

      const output = files.join('\n') + (files.length >= MAX_LIST_FILES ? '\n\n[... truncated]' : '');

      logger.info('Files listed successfully', { dirPath, count: files.length });

      return {
        success: true,
        output,
        metadata: {
          path: dirPath,
          resolved,
          count: files.length,
          truncated: files.length >= MAX_LIST_FILES,
        },
      };
    } catch (error: any) {
      logger.error('Failed to list files', { dirPath, error: error.message });

      return {
        success: false,
        error: error.message,
        metadata: { path: dirPath },
      };
    }
  },
};

/**
 * Export helper functions for testing
 */
export { isWithinWorkspace, resolveFilePath, isBinaryFile };
