import { validatePluginSource } from './skill-validator.js';
import type { ValidationResult } from './skill-validator.js';

/** Function signature for LLM text generation. */
export type GenerateFn = (prompt: string) => Promise<string>;

export interface SkillAuthorOptions {
  generate: GenerateFn;
  maxRetries?: number;
}

export interface SkillAuthorResult {
  success: boolean;
  source?: string;
  pluginName?: string;
  toolNames?: string[];
  errors?: string[];
}

/** System prompt template for generating plugin code. */
const SYSTEM_PROMPT = `You are a plugin code generator for Auxiora. Generate a valid TypeScript ESM plugin file.

Rules:
- Export a single \`export const plugin = { ... }\` object
- The plugin must have: name (lowercase_snake_case), version ('1.0.0'), description, permissions ([] unless network needed), tools array
- Each tool needs: name (lowercase_snake_case), description, parameters (JSON Schema object), execute (async function returning { success, output })
- Do NOT use require(), child_process, fs, process.env, or globalThis
- Do NOT use dynamic code execution constructors
- Use only ESM imports if needed
- Return ONLY the code, no markdown fences or explanation`;

export class SkillAuthor {
  private generate: GenerateFn;
  private maxRetries: number;

  constructor(options: SkillAuthorOptions) {
    this.generate = options.generate;
    this.maxRetries = options.maxRetries ?? 1;
  }

  async createSkill(description: string): Promise<SkillAuthorResult> {
    let lastErrors: string[] = [];

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const prompt = attempt === 0
        ? `${SYSTEM_PROMPT}\n\nCreate a plugin that: ${description}`
        : `${SYSTEM_PROMPT}\n\nCreate a plugin that: ${description}\n\nYour previous attempt had these errors:\n${lastErrors.map(e => `- ${e}`).join('\n')}\n\nFix these issues.`;

      let source: string;
      try {
        source = await this.generate(prompt);
      } catch {
        return { success: false, errors: ['LLM generation failed'] };
      }

      // Strip markdown fences if the LLM included them
      source = SkillAuthor.stripCodeFences(source);

      const validation: ValidationResult = validatePluginSource(source);
      if (validation.valid) {
        const pluginName = SkillAuthor.extractPluginName(source);
        const toolNames = SkillAuthor.extractToolNames(source);
        return { success: true, source, pluginName, toolNames };
      }

      lastErrors = validation.errors;
    }

    return { success: false, errors: lastErrors };
  }

  /** Remove markdown code fences from LLM output. */
  private static stripCodeFences(source: string): string {
    return source
      .replace(/^```(?:typescript|ts|javascript|js)?\n?/m, '')
      .replace(/\n?```\s*$/m, '')
      .trim();
  }

  /** Extract plugin name from source. */
  private static extractPluginName(source: string): string {
    const match = source.match(/name:\s*['"]([^'"]+)['"]/);
    return match?.[1] ?? 'unknown';
  }

  /** Extract tool names from source (skip plugin name — first match). */
  private static extractToolNames(source: string): string[] {
    const matches = [...source.matchAll(/name:\s*['"]([^'"]+)['"]/g)];
    // Skip first match (plugin name)
    return matches.slice(1).map(m => m[1]);
  }
}
