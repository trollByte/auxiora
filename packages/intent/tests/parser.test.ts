import { describe, it, expect } from 'vitest';
import { IntentParser } from '../src/parser.js';

describe('IntentParser', () => {
  const parser = new IntentParser();

  it('should parse send message intent', () => {
    const result = parser.parse('Send a message to @john');
    expect(result.type).toBe('send_message');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.entities.some((e) => e.type === 'mention')).toBe(true);
  });

  it('should parse search intent', () => {
    const result = parser.parse('Search for TypeScript tutorials');
    expect(result.type).toBe('search');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('should parse browse web intent', () => {
    const result = parser.parse('Navigate to https://example.com');
    expect(result.type).toBe('browse_web');
    expect(result.entities.some((e) => e.type === 'url')).toBe(true);
  });

  it('should parse schedule intent', () => {
    const result = parser.parse('Schedule a meeting for tomorrow at 3:00 pm');
    expect(result.type).toBe('schedule');
    expect(result.entities.some((e) => e.type === 'date')).toBe(true);
    expect(result.entities.some((e) => e.type === 'time')).toBe(true);
  });

  it('should parse remind intent', () => {
    const result = parser.parse('Remind me to call the doctor tomorrow');
    expect(result.type).toBe('remind');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('should parse delete file intent', () => {
    const result = parser.parse('Delete the file /tmp/test.txt');
    expect(result.type).toBe('delete_file');
    expect(result.entities.some((e) => e.type === 'file_path')).toBe(true);
  });

  it('should parse run command intent', () => {
    const result = parser.parse('Run the terminal command to list files');
    expect(result.type).toBe('run_command');
  });

  it('should parse summarize intent', () => {
    const result = parser.parse('Summarize this article for me');
    expect(result.type).toBe('summarize');
  });

  it('should return unknown for ambiguous input', () => {
    const result = parser.parse('hello');
    expect(result.type).toBe('unknown');
    expect(result.confidence).toBe(0);
  });

  it('should detect connectors', () => {
    const result = parser.parse('Send a message on Slack');
    expect(result.requiredConnectors).toContain('slack');
  });

  it('should detect email entities', () => {
    const result = parser.parse('Send an email to user@example.com');
    expect(result.entities.some((e) => e.type === 'email')).toBe(true);
  });

  it('should preserve raw text', () => {
    const text = 'Schedule a meeting for tomorrow';
    const result = parser.parse(text);
    expect(result.rawText).toBe(text);
  });

  it('should start with empty action steps', () => {
    const result = parser.parse('Search for something');
    expect(result.actionSteps).toEqual([]);
  });

  it('should detect github connector', () => {
    const result = parser.parse('Create a pull request on github');
    expect(result.requiredConnectors).toContain('github');
  });

  it('should parse query intent', () => {
    const result = parser.parse('What is the capital of France?');
    expect(result.type).toBe('query');
  });

  it('should parse translate intent', () => {
    const result = parser.parse('Translate this to Spanish');
    expect(result.type).toBe('translate');
  });
});
