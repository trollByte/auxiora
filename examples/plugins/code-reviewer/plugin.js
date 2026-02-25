/**
 * Code Reviewer Plugin — Multi-model plugin using ask_model
 *
 * Demonstrates:
 * - PluginManifest with PROVIDER_ACCESS permission
 * - Using PluginContext for provider registration
 * - A tool that reviews code using AI
 */

export const plugin = {
  name: 'code-reviewer',
  version: '1.0.0',
  description: 'AI-powered code review for pasted code snippets',
  permissions: ['PROVIDER_ACCESS'],

  tools: [
    {
      name: 'review_code',
      description: 'Review a code snippet for bugs, style issues, and improvements',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'The code snippet to review' },
          language: { type: 'string', description: 'Programming language (e.g., "typescript", "python")' },
          focus: { type: 'string', description: 'Review focus: "bugs", "style", "performance", "security", or "all"' },
        },
        required: ['code'],
      },
      execute: async ({ code, language = 'auto-detect', focus = 'all' }) => {
        // In a real plugin, this would call ask_model via the PluginContext
        // For this example, we provide a structured analysis template

        const lines = code.split('\n');
        const findings = [];

        // Basic static analysis
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const lineNum = i + 1;

          // Check for common issues
          if (line.includes('console.log') && language !== 'test') {
            findings.push(`Line ${lineNum}: Debug console.log statement found — consider removing before production`);
          }

          if (line.includes('TODO') || line.includes('FIXME') || line.includes('HACK')) {
            findings.push(`Line ${lineNum}: Unresolved comment marker found: ${line.trim()}`);
          }

          if (line.length > 120) {
            findings.push(`Line ${lineNum}: Line exceeds 120 characters (${line.length} chars)`);
          }

          if (line.includes('any') && (language === 'typescript' || language === 'ts')) {
            findings.push(`Line ${lineNum}: Usage of "any" type reduces type safety`);
          }

          if (/catch\s*\(\s*\)\s*\{/.test(line)) {
            findings.push(`Line ${lineNum}: Empty catch block — errors should be handled or logged`);
          }

          if (/==(?!=)/.test(line) && !line.includes('===')) {
            findings.push(`Line ${lineNum}: Loose equality (==) — consider strict equality (===)`);
          }
        }

        const summary = [
          `Code Review: ${language} (${lines.length} lines)`,
          `Focus: ${focus}`,
          '',
          findings.length > 0
            ? `Found ${findings.length} issue${findings.length === 1 ? '' : 's'}:`
            : 'No issues found in static analysis.',
          '',
          ...findings.map(f => `  - ${f}`),
          '',
          'Note: For deeper AI-powered analysis, ensure PROVIDER_ACCESS permission is granted',
          'and a model provider is configured.',
        ].join('\n');

        return {
          success: true,
          output: summary,
        };
      },
    },
    {
      name: 'explain_code',
      description: 'Explain what a code snippet does in plain language',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'The code snippet to explain' },
          detail: { type: 'string', description: 'Detail level: "brief", "normal", or "detailed"' },
        },
        required: ['code'],
      },
      execute: async ({ code, detail = 'normal' }) => {
        const lines = code.split('\n').filter(l => l.trim());
        const hasFunction = /function\s+\w+|const\s+\w+\s*=\s*(async\s+)?(\([^)]*\)|[\w]+)\s*=>/.test(code);
        const hasClass = /class\s+\w+/.test(code);
        const hasImport = /import\s+/.test(code);
        const hasExport = /export\s+/.test(code);

        const parts = [];
        parts.push(`This code has ${lines.length} lines of code.`);

        if (hasImport) parts.push('It imports dependencies from other modules.');
        if (hasExport) parts.push('It exports functionality for use by other modules.');
        if (hasClass) parts.push('It defines one or more classes.');
        if (hasFunction) parts.push('It defines one or more functions.');

        if (detail === 'detailed') {
          parts.push('');
          parts.push('For a detailed AI-powered explanation, ensure PROVIDER_ACCESS');
          parts.push('permission is granted and use the ask_model tool.');
        }

        return {
          success: true,
          output: parts.join('\n'),
        };
      },
    },
  ],

  initialize: async (ctx) => {
    ctx.logger.info('Code reviewer plugin initialized');
  },
};
