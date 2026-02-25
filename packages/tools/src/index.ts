/**
 * Tool system for Auxiora
 *
 * Provides:
 * - Tool interface and registry
 * - Permission system (auto-approve, user-approve, deny)
 * - Tool executor with sandboxing
 * - Built-in tools (bash, web, files)
 */

import { getLogger } from '@auxiora/logger';
import { ErrorCode, AuxioraError } from '@auxiora/errors';
import { applicationMetrics } from '@auxiora/metrics';

const logger = getLogger('tools');

export enum ToolPermission {
  AUTO_APPROVE = 'auto_approve',
  USER_APPROVAL = 'user_approval',
  ALWAYS_DENY = 'always_deny',
}

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  default?: any;
  /** JSON Schema for array items (required by OpenAI when type is 'array') */
  items?: Record<string, any>;
  /** JSON Schema for object properties (when type is 'object') */
  properties?: Record<string, any>;
}

export interface ExecutionContext {
  userId?: string;
  sessionId?: string;
  workingDirectory?: string;
  timeout?: number;
  environment?: Record<string, string>;
}

export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
  metadata?: Record<string, any>;
  duration?: number;
}

export interface Tool {
  name: string;
  description: string;
  parameters: ToolParameter[];
  execute: (params: any, context: ExecutionContext) => Promise<ToolResult>;
  getPermission: (params: any, context: ExecutionContext) => ToolPermission;
  validateParams?: (params: any) => string | null; // Returns error message or null
}

/**
 * Tool execution error
 */
export class ToolError extends AuxioraError {
  constructor(message: string, context?: Record<string, any>) {
    super({
      code: ErrorCode.INTERNAL_ERROR,
      message,
      userMessage: 'Tool execution failed',
      retryable: false,
      context,
    });
  }
}

/**
 * Tool registry - manages available tools
 */
export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      logger.warn(`Tool ${tool.name} already registered, overwriting`);
    }

    this.tools.set(tool.name, tool);
    logger.debug(`Registered tool: ${tool.name}`);
  }

  unregister(toolName: string): void {
    this.tools.delete(toolName);
    logger.info(`Unregistered tool: ${toolName}`);
  }

  get(toolName: string): Tool | undefined {
    return this.tools.get(toolName);
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  listNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get tools formatted for AI provider APIs
   */
  toProviderFormat(): Array<{
    name: string;
    description: string;
    input_schema: {
      type: 'object';
      properties: Record<string, any>;
      required: string[];
    };
  }> {
    return this.list().map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object',
        properties: tool.parameters.reduce((acc, param) => {
          acc[param.name] = {
            type: param.type,
            description: param.description,
          };
          if (param.default !== undefined) {
            acc[param.name].default = param.default;
          }
          if (param.items) {
            acc[param.name].items = param.items;
          }
          if (param.properties) {
            acc[param.name].properties = param.properties;
          }
          return acc;
        }, {} as Record<string, any>),
        required: tool.parameters.filter((p) => p.required).map((p) => p.name),
      },
    }));
  }
}

/**
 * Approval request callback
 */
export type ApprovalCallback = (
  toolName: string,
  params: any,
  context: ExecutionContext
) => Promise<boolean>;

/**
 * Tool executor - executes tools with permission checking
 */
export class ToolExecutor {
  constructor(
    private registry: ToolRegistry,
    private approvalCallback?: ApprovalCallback
  ) {}

  /**
   * Execute a tool with permission checking
   */
  async execute(
    toolName: string,
    params: any,
    context: ExecutionContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      // Get tool
      const tool = this.registry.get(toolName);
      if (!tool) {
        throw new ToolError(`Tool not found: ${toolName}`, { toolName });
      }

      // Validate parameters
      if (tool.validateParams) {
        const error = tool.validateParams(params);
        if (error) {
          throw new ToolError(`Invalid parameters: ${error}`, { toolName, params });
        }
      }

      // Check permissions
      const permission = tool.getPermission(params, context);

      if (permission === ToolPermission.ALWAYS_DENY) {
        logger.warn(`Tool execution denied: ${toolName}`, { params, context });
        throw new ToolError(`Tool execution denied for security reasons`, {
          toolName,
          params,
        });
      }

      if (permission === ToolPermission.USER_APPROVAL) {
        if (!this.approvalCallback) {
          throw new ToolError(`Tool requires approval but no approval callback set`, {
            toolName,
          });
        }

        const approved = await this.approvalCallback(toolName, params, context);
        if (!approved) {
          logger.info(`Tool execution rejected by user: ${toolName}`, { params });
          return {
            success: false,
            error: 'Execution rejected by user',
            metadata: { permission: 'user_rejected' },
          };
        }
      }

      // Execute tool
      logger.info(`Executing tool: ${toolName}`, { params, permission });
      const result = await tool.execute(params, context);

      const duration = performance.now() - startTime;
      result.duration = duration;

      // Record metrics
      applicationMetrics.errorsTotal.inc({
        type: 'tool',
        code: result.success ? 'success' : 'failure',
      });

      logger.info(`Tool execution completed: ${toolName}`, {
        success: result.success,
        duration: duration.toFixed(2),
      });

      return result;
    } catch (error: unknown) {
      const duration = performance.now() - startTime;
      const errorObj = error instanceof Error ? error : new Error(String(error));

      logger.error(`Tool execution failed: ${toolName}`, { error: errorObj, params });

      applicationMetrics.errorsTotal.inc({
        type: 'tool',
        code: 'error',
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration,
      };
    }
  }

  /**
   * Execute multiple tools in sequence
   */
  async executeMany(
    tools: Array<{ name: string; params: any }>,
    context: ExecutionContext
  ): Promise<ToolResult[]> {
    const results: ToolResult[] = [];

    for (const { name, params } of tools) {
      const result = await this.execute(name, params, context);
      results.push(result);

      // Stop on first failure if configured
      if (!result.success && context.environment?.STOP_ON_ERROR === 'true') {
        break;
      }
    }

    return results;
  }
}

/**
 * Global tool registry and executor
 */
export const toolRegistry = new ToolRegistry();
export let toolExecutor: ToolExecutor;

/**
 * Initialize the tool executor with approval callback
 */
export function initializeToolExecutor(approvalCallback?: ApprovalCallback): void {
  toolExecutor = new ToolExecutor(toolRegistry, approvalCallback);
  logger.info('Tool executor initialized');
}

// Import and register built-in tools
import { BashTool } from './bash.js';
import { WebBrowserTool } from './web.js';
import { FileReadTool, FileWriteTool, FileListTool } from './files.js';

// Register built-in tools
toolRegistry.register(BashTool);
toolRegistry.register(WebBrowserTool);
toolRegistry.register(FileReadTool);
toolRegistry.register(FileWriteTool);
toolRegistry.register(FileListTool);

logger.info('Built-in tools registered', {
  tools: toolRegistry.listNames(),
});

// Export built-in tools
export { BashTool } from './bash.js';
export { WebBrowserTool } from './web.js';
export { FileReadTool, FileWriteTool, FileListTool } from './files.js';

// Import and register behavior tools
import { CreateBehaviorTool, ListBehaviorsTool, UpdateBehaviorTool, DeleteBehaviorsTool } from './behaviors.js';

toolRegistry.register(CreateBehaviorTool);
toolRegistry.register(ListBehaviorsTool);
toolRegistry.register(UpdateBehaviorTool);
toolRegistry.register(DeleteBehaviorsTool);

// Export behavior tools
export { CreateBehaviorTool, ListBehaviorsTool, UpdateBehaviorTool, DeleteBehaviorsTool } from './behaviors.js';
export { setBehaviorManager } from './behaviors.js';

// Import and register browser tools
import {
  BrowserNavigateTool,
  BrowserClickTool,
  BrowserTypeTool,
  BrowserScreenshotTool,
  BrowserExtractTool,
  BrowserWaitTool,
  BrowserEvaluateTool,
  BrowseTool,
} from './browser.js';

toolRegistry.register(BrowserNavigateTool);
toolRegistry.register(BrowserClickTool);
toolRegistry.register(BrowserTypeTool);
toolRegistry.register(BrowserScreenshotTool);
toolRegistry.register(BrowserExtractTool);
toolRegistry.register(BrowserWaitTool);
toolRegistry.register(BrowserEvaluateTool);
toolRegistry.register(BrowseTool);

// Export browser tools
export {
  BrowserNavigateTool,
  BrowserClickTool,
  BrowserTypeTool,
  BrowserScreenshotTool,
  BrowserExtractTool,
  BrowserWaitTool,
  BrowserEvaluateTool,
  BrowseTool,
} from './browser.js';
export { setBrowserManager } from './browser.js';

// Import and register webhook tools
import { WebhookListTool, WebhookCreateTool, WebhookDeleteTool } from './webhooks.js';

toolRegistry.register(WebhookListTool);
toolRegistry.register(WebhookCreateTool);
toolRegistry.register(WebhookDeleteTool);

// Export webhook tools
export { WebhookListTool, WebhookCreateTool, WebhookDeleteTool } from './webhooks.js';
export { setWebhookManager } from './webhooks.js';

// Import and register memory tools
import { SaveMemoryTool, RecallMemoryTool, ForgetMemoryTool, ListMemoriesTool } from './memory.js';

toolRegistry.register(SaveMemoryTool);
toolRegistry.register(RecallMemoryTool);
toolRegistry.register(ForgetMemoryTool);
toolRegistry.register(ListMemoriesTool);

// Export memory tools
export { SaveMemoryTool, RecallMemoryTool, ForgetMemoryTool, ListMemoriesTool } from './memory.js';
export { setMemoryStore } from './memory.js';

// Import and register ask-model tool
import { AskModelTool } from './ask-model.js';

toolRegistry.register(AskModelTool);

// Export ask-model tool
export { AskModelTool } from './ask-model.js';
export { setProviderFactory } from './ask-model.js';

// Import and register assemble-team tool
import { AssembleTeamTool } from './assemble-team.js';

toolRegistry.register(AssembleTeamTool);

// Export assemble-team tool
export { AssembleTeamTool } from './assemble-team.js';
export { setOrchestrationEngine } from './assemble-team.js';

// Import and register build-personality tool
import { BuildPersonalityTool } from './build-personality.js';

toolRegistry.register(BuildPersonalityTool);

// Export build-personality tool
export { BuildPersonalityTool } from './build-personality.js';

// Import and register email tools
import { EmailTriageTool, EmailReplyTool, EmailSearchTool, EmailComposeTool, EmailSummarizeTool } from './email.js';

toolRegistry.register(EmailTriageTool);
toolRegistry.register(EmailReplyTool);
toolRegistry.register(EmailSearchTool);
toolRegistry.register(EmailComposeTool);
toolRegistry.register(EmailSummarizeTool);

// Export email tools
export { EmailTriageTool, EmailReplyTool, EmailSearchTool, EmailComposeTool, EmailSummarizeTool } from './email.js';
export { setEmailIntelligence, setEmailConnectors } from './email.js';

// Import and register calendar tools
import { CalendarOptimizeTool, ScheduleMeetingTool, MeetingPrepTool } from './calendar.js';

toolRegistry.register(CalendarOptimizeTool);
toolRegistry.register(ScheduleMeetingTool);
toolRegistry.register(MeetingPrepTool);

// Export calendar tools
export { CalendarOptimizeTool, ScheduleMeetingTool, MeetingPrepTool } from './calendar.js';
export { setCalendarIntelligence, setCalendarConnectors } from './calendar.js';

// Import and register OS bridge tools
import { ClipboardTransformTool, AppLaunchTool, SystemInfoTool } from './os-bridge.js';

toolRegistry.register(ClipboardTransformTool);
toolRegistry.register(AppLaunchTool);
toolRegistry.register(SystemInfoTool);

// Export OS bridge tools
export { ClipboardTransformTool, AppLaunchTool, SystemInfoTool } from './os-bridge.js';
export { setClipboardMonitor, setAppController, setSystemStateMonitor } from './os-bridge.js';

// Import and register social tools
import { PostSocialTool, CheckMentionsTool, SchedulePostTool } from './social.js';

toolRegistry.register(PostSocialTool);
toolRegistry.register(CheckMentionsTool);
toolRegistry.register(SchedulePostTool);

// Export social tools
export { PostSocialTool, CheckMentionsTool, SchedulePostTool } from './social.js';
export { setSocialConnectors } from './social.js';

// Import and register contacts tools
import { WhoIsTool, ContactSearchTool } from './contacts.js';

toolRegistry.register(WhoIsTool);
toolRegistry.register(ContactSearchTool);

// Export contacts tools
export { WhoIsTool, ContactSearchTool } from './contacts.js';
export { setContactGraph, setContextRecall } from './contacts.js';

// Import research tools (registered lazily when engine is set)
import { ResearchTool, setResearchEngine as _setResearchEngine } from './research.js';

export function setResearchEngine(engine: any): void {
  _setResearchEngine(engine);
  if (engine) {
    toolRegistry.register(ResearchTool);
  } else {
    toolRegistry.unregister(ResearchTool.name);
  }
}

// Export research tools
export { ResearchTool } from './research.js';

// Import and register compose tools
import { ComposeTool, GrammarCheckTool, DetectLanguageTool } from './compose.js';

toolRegistry.register(ComposeTool);
toolRegistry.register(GrammarCheckTool);
toolRegistry.register(DetectLanguageTool);

// Export compose tools
export { ComposeTool, GrammarCheckTool, DetectLanguageTool } from './compose.js';
export { setComposeEngine, setGrammarChecker, setLanguageDetector } from './compose.js';

// Export sandbox
export { ToolSandbox } from './sandbox.js';
export type { SandboxPolicy, SandboxedResult } from './sandbox.js';
