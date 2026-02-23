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

  it('should reject source with new Function constructor', () => {
    const source = `const fn = new Function('return 1');\nexport const plugin = { name: 'ok', version: '1.0.0', tools: [] };`;
    const result = validatePluginSource(source);
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

  it('should reject source with process.env access', () => {
    const source = `const key = process.env.API_KEY;\nexport const plugin = { name: 'test', version: '1.0.0', tools: [] };`;
    const result = validatePluginSource(source);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('process.env'))).toBe(true);
  });

  it('should reject source with globalThis access', () => {
    const source = `globalThis.secret = true;\nexport const plugin = { name: 'test', version: '1.0.0', tools: [] };`;
    const result = validatePluginSource(source);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('globalThis'))).toBe(true);
  });

  it('should reject source with fs import', () => {
    const source = `import * as fs from 'node:fs';\nexport const plugin = { name: 'test', version: '1.0.0', tools: [] };`;
    const result = validatePluginSource(source);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('fs'))).toBe(true);
  });

  it('should accept plugin with multiple valid tools', () => {
    const source = `
export const plugin = {
  name: 'multi_tool',
  version: '1.0.0',
  permissions: [],
  tools: [
    { name: 'tool_one', description: 'First', parameters: { type: 'object', properties: {} }, execute: async () => ({ success: true }) },
    { name: 'tool_two', description: 'Second', parameters: { type: 'object', properties: {} }, execute: async () => ({ success: true }) },
  ],
};`;
    const result = validatePluginSource(source);
    expect(result.valid).toBe(true);
  });
});
