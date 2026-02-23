# Self-Authoring Skills Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable the AI to write new plugin files autonomously when asked to do something it can't currently do — a `create_skill` built-in tool that generates, validates, and registers plugins at runtime.

**Architecture:** A `SkillAuthor` service uses the LLM to generate plugin code from natural language, validates it against the plugin schema and a security blocklist, writes it to `~/.auxiora/plugins/`, and hot-loads it via `PluginLoader`. A built-in `create_skill` tool exposes this to the AI during conversation.

**Tech Stack:** TypeScript ESM, vitest, existing `@auxiora/plugins` package, `@auxiora/tools` registry

---

## Background

The existing plugin system (`packages/plugins/`) already supports:
- Loading `.js` plugin files from `~/.auxiora/plugins/`
- Dynamic tool registration via `context.registerTool()` during `initialize()`
- Permission gating (`approvedPermissions` in config)
- Tool name validation (`/^[a-z][a-z0-9_]{1,62}$/`)
- 30-second execution timeout

What's missing: the ability for the AI itself to **write** a new plugin file and hot-load it during a conversation.

### Key files to understand:
- `packages/plugins/src/types.ts` — `PluginManifest`, `PluginToolDefinition`, `PluginContext` interfaces
- `packages/plugins/src/loader.ts` — `PluginLoader` class, `loadPlugin()`, `validatePlugin()`

---

### Task 1: Plugin Code Validator

A module that validates generated plugin source code before writing it to disk.

**Files:**
- Create: `packages/plugins/src/skill-validator.ts`
- Test: `packages/plugins/tests/skill-validator.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/plugins/tests/skill-validator.test.ts
import { describe, it, expect } from 'vitest';
import { validatePluginSource } from '../src/skill-validator.js';

describe('validatePluginSource', () => {
  it('should accept a valid plugin source', () => {
    const source = `
export const plugin = {
  name: 'hello_world',
  version: '1.0.0',
  description: 'Says hello',
  permissions: [],
  tools: [{
    name: 'say_hello',
    description: 'Says hello to a person',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Person name' } },
      required: ['name'],
    },
    execute: async (params) => ({ success: true, output: 'Hello ' + params.name }),
  }],
};`;
    const result = validatePluginSource(source);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('should reject source with require()', () => {
    const source = `const fs = require('fs');\nexport const plugin = { name: 'bad', version: '1.0.0', tools: [] };`;
    const result = validatePluginSource(source);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('require'))).toBe(true);
  });

  it('should reject source with child_process import', () => {
    const source = `import { exec } from 'child_process';\nexport const plugin = { name: 'bad', version: '1.0.0', tools: [] };`;
    const result = validatePluginSource(source);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('child_process'))).toBe(true);
  });

  it('should reject source with dangerous constructor patterns', () => {
    const source = `const fn = new DangerousConstructor('return 1');\nexport const plugin = { name: 'ok', version: '1.0.0', tools: [] };`;
    const result = validatePluginSource(source);
    // Validate that we block dynamic code execution patterns
    expect(result.valid).toBe(false);
  });

  it('should reject source missing plugin export', () => {
    const source = `export const notPlugin = { name: 'x' };`;
    const result = validatePluginSource(source);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('export const plugin'))).toBe(true);
  });

  it('should reject source with invalid tool name', () => {
    const source = `
export const plugin = {
  name: 'test',
  version: '1.0.0',
  permissions: [],
  tools: [{
    name: 'InvalidName',
    description: 'Bad',
    parameters: { type: 'object', properties: {} },
    execute: async () => ({ success: true }),
  }],
};`;
    const result = validatePluginSource(source);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('tool name'))).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/plugins && npx vitest run tests/skill-validator.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the validator**

```typescript
// packages/plugins/src/skill-validator.ts
import { TOOL_NAME_PATTERN } from './types.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Dangerous patterns that generated plugins must not contain. */
const BLOCKED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\brequire\s*\(/, reason: 'require() is not allowed — use ESM imports' },
  { pattern: /\bimport\s.*['"](?:child_process|node:child_process)['"]/, reason: 'child_process import is forbidden' },
  { pattern: /\bimport\s.*['"](?:fs|node:fs)['"]/, reason: 'Direct fs import is forbidden — use plugin context APIs' },
  { pattern: /\bprocess\.env\b/, reason: 'process.env access is forbidden — use plugin config' },
  { pattern: /\bglobalThis\b/, reason: 'globalThis access is forbidden' },
  // Block dynamic code execution constructors
  { pattern: /\bnew\s+(?:Function|AsyncFunction)\b/, reason: 'Dynamic code execution constructors are forbidden' },
];

/** Static analysis of generated plugin source code. */
export function validatePluginSource(source: string): ValidationResult {
  const errors: string[] = [];

  // Must export plugin
  if (!/export\s+const\s+plugin\b/.test(source)) {
    errors.push('Source must contain "export const plugin = ..."');
  }

  // Check blocked patterns
  for (const { pattern, reason } of BLOCKED_PATTERNS) {
    if (pattern.test(source)) {
      errors.push(reason);
    }
  }

  // Validate tool names via regex extraction
  const toolNameMatches = source.matchAll(/name:\s*['"]([^'"]+)['"]/g);
  let isFirstName = true;
  for (const match of toolNameMatches) {
    if (isFirstName) {
      // First name match is the plugin name, skip
      isFirstName = false;
      continue;
    }
    const name = match[1];
    if (!TOOL_NAME_PATTERN.test(name)) {
      errors.push(`Invalid tool name "${name}" — must match ${TOOL_NAME_PATTERN}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/plugins && npx vitest run tests/skill-validator.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/plugins/src/skill-validator.ts packages/plugins/tests/skill-validator.test.ts
git commit -m "feat(plugins): add static validator for generated plugin source code"
```

---

### Task 2: Skill Author Service

The core service that generates plugin code from a natural language description.

**Files:**
- Create: `packages/plugins/src/skill-author.ts`
- Test: `packages/plugins/tests/skill-author.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/plugins/tests/skill-author.test.ts
import { describe, it, expect, vi } from 'vitest';
import { SkillAuthor } from '../src/skill-author.js';

describe('SkillAuthor', () => {
  const mockGenerate = vi.fn();

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

    const author = new SkillAuthor({ generate: mockGenerate });
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
});
```

**Step 2–5: Implement SkillAuthor class with LLM prompt template, validation loop, retry logic. Test, commit.**

```bash
git commit -m "feat(plugins): add SkillAuthor service for LLM-driven plugin generation"
```

---

### Task 3: Skill Persistence & Hot-Loading

Write generated plugins to disk and hot-load them into the running PluginLoader.

**Files:**
- Create: `packages/plugins/src/skill-installer.ts`
- Test: `packages/plugins/tests/skill-installer.test.ts`
- Modify: `packages/plugins/src/loader.ts` — add `loadSingle(filePath)` public method

**Key behaviors:**
- Write to `~/.auxiora/plugins/<name>.js`
- Refuse to overwrite without `force` flag
- Sanitize name to prevent path traversal (`../escape`)
- Hot-load via new `PluginLoader.loadSingle(filePath)` method

```bash
git commit -m "feat(plugins): add SkillInstaller and PluginLoader.loadSingle for hot-loading"
```

---

### Task 4: Built-in `create_skill` Tool

Register a built-in tool in `@auxiora/tools` that the AI can call during conversation.

**Files:**
- Create: `packages/plugins/src/create-skill-tool.ts`
- Test: `packages/plugins/tests/create-skill-tool.test.ts`
- Modify: `packages/plugins/src/index.ts` — export `registerCreateSkillTool`

**Parameters:** `{ description: string, name?: string }`

**Pipeline:**
1. `SkillAuthor.createSkill(description)` → generated source
2. `SkillInstaller.install(name, source)` → file on disk
3. `PluginLoader.loadSingle(filePath)` → registered tools
4. Return tool names to the AI

```bash
git commit -m "feat(plugins): add create_skill built-in tool for self-authoring"
```

---

### Task 5: Wire into Runtime

**Files:**
- Modify: `packages/runtime/src/index.ts` — register `create_skill` tool during startup

After `PluginLoader.loadAll()`, call `registerCreateSkillTool(loader, generateFn)` to make the tool available. The `generateFn` wraps the configured provider's completion endpoint.

```bash
git commit -m "feat(runtime): wire create_skill tool into message loop"
```

---

### Task 6: Integration Test

**Files:**
- Create: `packages/plugins/tests/skill-author-integration.test.ts`

End-to-end test: description → generate → validate → install → load → execute tool.

```bash
git commit -m "test(plugins): add integration test for self-authoring skill pipeline"
```
