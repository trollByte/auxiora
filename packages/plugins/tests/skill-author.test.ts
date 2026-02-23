import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SkillAuthor } from '../src/skill-author.js';

describe('SkillAuthor', () => {
  const mockGenerate = vi.fn();

  beforeEach(() => {
    mockGenerate.mockReset();
  });

  it('should generate valid plugin code from description', async () => {
    const validPlugin = `export const plugin = {
  name: 'unit_converter',
  version: '1.0.0',
  description: 'Converts between units',
  permissions: [],
  tools: [{
    name: 'convert_units',
    description: 'Convert a value from one unit to another',
    parameters: {
      type: 'object',
      properties: {
        value: { type: 'number', description: 'The value to convert' },
        from: { type: 'string', description: 'Source unit' },
        to: { type: 'string', description: 'Target unit' },
      },
      required: ['value', 'from', 'to'],
    },
    execute: async (params) => {
      return { success: true, output: String(params.value) };
    },
  }],
};`;

    mockGenerate.mockResolvedValueOnce(validPlugin);

    const author = new SkillAuthor({ generate: mockGenerate });
    const result = await author.createSkill('Create a tool that converts between units like miles to km');

    expect(result.success).toBe(true);
    expect(result.source).toContain('export const plugin');
    expect(result.pluginName).toBe('unit_converter');
    expect(result.toolNames).toContain('convert_units');
  });

  it('should reject generated code that fails validation', async () => {
    mockGenerate.mockResolvedValueOnce(`const fs = require('fs');\nexport const plugin = { name: 'bad', version: '1.0.0', tools: [] };`);

    const author = new SkillAuthor({ generate: mockGenerate, maxRetries: 0 });
    const result = await author.createSkill('Read arbitrary files');

    expect(result.success).toBe(false);
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  it('should retry once if first generation fails validation', async () => {
    const badCode = `import { exec } from 'child_process';\nexport const plugin = { name: 'x', version: '1.0.0', tools: [] };`;
    const goodCode = `export const plugin = {
  name: 'greeter',
  version: '1.0.0',
  description: 'Greets',
  permissions: [],
  tools: [{
    name: 'greet',
    description: 'Greet someone',
    parameters: { type: 'object', properties: { name: { type: 'string', description: 'Name' } }, required: ['name'] },
    execute: async (p) => ({ success: true, output: 'Hi ' + p.name }),
  }],
};`;

    mockGenerate.mockResolvedValueOnce(badCode).mockResolvedValueOnce(goodCode);

    const author = new SkillAuthor({ generate: mockGenerate });
    const result = await author.createSkill('Create a greeting tool');

    expect(result.success).toBe(true);
    expect(mockGenerate).toHaveBeenCalledTimes(2);
  });

  it('should strip markdown code fences from LLM output', async () => {
    const wrappedCode = '```typescript\nexport const plugin = {\n  name: \'fenced\',\n  version: \'1.0.0\',\n  description: \'Test\',\n  permissions: [],\n  tools: [{\n    name: \'do_thing\',\n    description: \'Does a thing\',\n    parameters: { type: \'object\', properties: {} },\n    execute: async () => ({ success: true }),\n  }],\n};\n```';

    mockGenerate.mockResolvedValueOnce(wrappedCode);

    const author = new SkillAuthor({ generate: mockGenerate });
    const result = await author.createSkill('Do a thing');

    expect(result.success).toBe(true);
    expect(result.source).not.toContain('```');
  });

  it('should handle LLM generation failure', async () => {
    mockGenerate.mockRejectedValueOnce(new Error('API error'));

    const author = new SkillAuthor({ generate: mockGenerate });
    const result = await author.createSkill('anything');

    expect(result.success).toBe(false);
    expect(result.errors).toContain('LLM generation failed');
  });

  it('should include error feedback in retry prompt', async () => {
    const badCode = `const fs = require('fs');\nexport const plugin = { name: 'x', version: '1.0.0', tools: [] };`;
    mockGenerate.mockResolvedValueOnce(badCode).mockResolvedValueOnce(badCode);

    const author = new SkillAuthor({ generate: mockGenerate, maxRetries: 1 });
    await author.createSkill('anything');

    // Second call should include error feedback
    const secondPrompt = mockGenerate.mock.calls[1][0] as string;
    expect(secondPrompt).toContain('previous attempt');
    expect(secondPrompt).toContain('require');
  });
});
