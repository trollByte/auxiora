import { describe, it, expect } from 'vitest';
import { assessRisk, describeAction } from '../src/risk-assessor.js';

describe('assessRisk', () => {
  it('should classify destructive tool names as critical', () => {
    expect(assessRisk('deleteUser', {})).toBe('critical');
    expect(assessRisk('dropTable', {})).toBe('critical');
    expect(assessRisk('destroyCluster', {})).toBe('critical');
    expect(assessRisk('purgeCache', {})).toBe('critical');
  });

  it('should classify destructive params as critical', () => {
    expect(assessRisk('executeAction', { action: 'delete-all' })).toBe('critical');
    expect(assessRisk('runQuery', { query: 'DROP TABLE users' })).toBe('critical');
  });

  it('should classify write/send tools as high', () => {
    expect(assessRisk('writeFile', {})).toBe('high');
    expect(assessRisk('sendEmail', {})).toBe('high');
    expect(assessRisk('postMessage', {})).toBe('high');
    expect(assessRisk('executeCommand', {})).toBe('high');
    expect(assessRisk('deployApp', {})).toBe('high');
  });

  it('should classify state-modifying tools as medium', () => {
    expect(assessRisk('modifyConfig', {})).toBe('medium');
    expect(assessRisk('editFile', {})).toBe('medium');
    expect(assessRisk('setVariable', {})).toBe('medium');
    expect(assessRisk('renameFile', {})).toBe('medium');
  });

  it('should classify read-only tools as low', () => {
    expect(assessRisk('readFile', {})).toBe('low');
    expect(assessRisk('getUser', {})).toBe('low');
    expect(assessRisk('listItems', {})).toBe('low');
    expect(assessRisk('search', {})).toBe('low');
  });
});

describe('describeAction', () => {
  it('should produce a human-readable description with risk level', () => {
    const desc = describeAction('sendEmail', { to: 'user@example.com', subject: 'Hello' });
    expect(desc).toBe('[HIGH] Execute "sendEmail" with to, subject');
  });

  it('should handle empty params', () => {
    const desc = describeAction('readFile', {});
    expect(desc).toBe('[LOW] Execute "readFile"');
  });

  it('should show CRITICAL for destructive tools', () => {
    const desc = describeAction('deleteDatabase', { name: 'prod' });
    expect(desc).toContain('[CRITICAL]');
  });
});
