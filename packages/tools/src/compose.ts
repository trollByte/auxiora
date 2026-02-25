import type { Tool, ToolParameter, ToolResult } from './index.js';
import { ToolPermission } from './index.js';
import { getLogger } from '@auxiora/logger';

const logger = getLogger('tools:compose');

let composeEngine: any = null;
let grammarChecker: any = null;
let languageDetector: any = null;

export function setComposeEngine(engine: any): void {
  composeEngine = engine;
  logger.info('Compose engine connected to tools');
}

export function setGrammarChecker(checker: any): void {
  grammarChecker = checker;
  logger.info('Grammar checker connected to tools');
}

export function setLanguageDetector(detector: any): void {
  languageDetector = detector;
  logger.info('Language detector connected to tools');
}

export const ComposeTool: Tool = {
  name: 'compose',
  description: 'Compose text with platform-appropriate tone and constraints. Handles emails, social media posts, Slack messages, etc. Call this when the user asks to write, draft, or compose content for a specific platform or audience.',

  parameters: [
    {
      name: 'content',
      type: 'string',
      description: 'The text to compose or refine',
      required: true,
    },
    {
      name: 'platform',
      type: 'string',
      description: 'Target platform: "email", "slack", "linkedin", "twitter", "reddit", or "generic"',
      required: false,
      default: 'generic',
    },
    {
      name: 'tone',
      type: 'string',
      description: 'Desired tone: "formal", "professional", "casual", "brief", "friendly", or "assertive"',
      required: false,
    },
    {
      name: 'audience',
      type: 'string',
      description: 'Description of the target audience (e.g., "engineering team", "clients")',
      required: false,
    },
    {
      name: 'maxLength',
      type: 'number',
      description: 'Maximum character length for the output',
      required: false,
    },
  ] as ToolParameter[],

  getPermission(): ToolPermission {
    return ToolPermission.AUTO_APPROVE;
  },

  async execute(params: any): Promise<ToolResult> {
    try {
      if (!composeEngine) {
        return { success: false, error: 'Compose engine not configured.' };
      }

      const result = composeEngine.compose({
        content: params.content,
        context: {
          platform: params.platform || 'generic',
          tone: params.tone,
          audience: params.audience,
          maxLength: params.maxLength,
        },
      });

      return {
        success: true,
        output: JSON.stringify({
          text: result.text,
          tone: result.tone,
          platform: result.platform,
          wordCount: result.wordCount,
          characterCount: result.characterCount,
        }, null, 2),
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

export const GrammarCheckTool: Tool = {
  name: 'grammar_check',
  description: 'Check text for grammar, spelling, style, and clarity issues. Call this when the user asks to proofread, check grammar, or improve their writing.',

  parameters: [
    {
      name: 'text',
      type: 'string',
      description: 'Text to check for grammar and style issues',
      required: true,
    },
  ] as ToolParameter[],

  getPermission(): ToolPermission {
    return ToolPermission.AUTO_APPROVE;
  },

  async execute(params: any): Promise<ToolResult> {
    try {
      if (!grammarChecker) {
        return { success: false, error: 'Grammar checker not configured.' };
      }

      const issues = grammarChecker.check(params.text);

      return {
        success: true,
        output: JSON.stringify({
          issueCount: issues.length,
          issues: issues.map((i: any) => ({
            type: i.type,
            message: i.message,
            position: i.position,
            suggestion: i.suggestion,
            severity: i.severity,
          })),
        }, null, 2),
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

export const DetectLanguageTool: Tool = {
  name: 'detect_language',
  description: 'Detect the language of a piece of text. Call this when the user pastes foreign text or needs to identify a language.',

  parameters: [
    {
      name: 'text',
      type: 'string',
      description: 'Text to analyze for language detection',
      required: true,
    },
  ] as ToolParameter[],

  getPermission(): ToolPermission {
    return ToolPermission.AUTO_APPROVE;
  },

  async execute(params: any): Promise<ToolResult> {
    try {
      if (!languageDetector) {
        return { success: false, error: 'Language detector not configured.' };
      }

      const result = languageDetector.detect(params.text);

      return {
        success: true,
        output: JSON.stringify({
          language: result.language,
          confidence: result.confidence,
          isRTL: languageDetector.isRTL(result.language),
        }),
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};
