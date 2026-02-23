import { describe, it, expect } from 'vitest';
import { obsidianConnector } from '../src/connector.js';

describe('obsidianConnector', () => {
  it('should have correct id and name', () => {
    expect(obsidianConnector.id).toBe('obsidian');
    expect(obsidianConnector.name).toBe('Obsidian');
  });

  it('should use api_key auth', () => {
    expect(obsidianConnector.auth.type).toBe('api_key');
  });

  it('should have all 8 actions', () => {
    expect(obsidianConnector.actions.length).toBe(8);
  });

  it('should have note and search actions', () => {
    const ids = obsidianConnector.actions.map(a => a.id);
    expect(ids).toContain('note-read');
    expect(ids).toContain('note-write');
    expect(ids).toContain('note-append');
    expect(ids).toContain('note-create');
    expect(ids).toContain('notes-list');
    expect(ids).toContain('notes-search');
    expect(ids).toContain('daily-note');
    expect(ids).toContain('tags-list');
  });

  it('should mark read actions as no side effects', () => {
    const read = obsidianConnector.actions.find(a => a.id === 'note-read');
    expect(read?.sideEffects).toBe(false);
    expect(read?.trustMinimum).toBe(1);

    const search = obsidianConnector.actions.find(a => a.id === 'notes-search');
    expect(search?.sideEffects).toBe(false);
    expect(search?.trustMinimum).toBe(1);
  });

  it('should mark write actions as having side effects', () => {
    const write = obsidianConnector.actions.find(a => a.id === 'note-write');
    expect(write?.sideEffects).toBe(true);
    expect(write?.trustMinimum).toBeGreaterThanOrEqual(2);
  });

  it('should have note-modified trigger', () => {
    expect(obsidianConnector.triggers.map(t => t.id)).toContain('note-modified');
  });

  it('should be in productivity category', () => {
    expect(obsidianConnector.category).toBe('productivity');
  });
});
