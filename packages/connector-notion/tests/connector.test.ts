import { describe, it, expect } from 'vitest';
import { notionConnector } from '../src/connector.js';

describe('Notion Connector', () => {
  it('should have correct metadata', () => {
    expect(notionConnector.id).toBe('notion');
    expect(notionConnector.name).toBe('Notion');
    expect(notionConnector.category).toBe('productivity');
  });

  it('should use OAuth2 authentication', () => {
    expect(notionConnector.auth.type).toBe('oauth2');
    expect(notionConnector.auth.oauth2).toBeDefined();
  });

  it('should define page actions', () => {
    const pageActions = notionConnector.actions.filter((a) => a.id.startsWith('pages-'));
    expect(pageActions.length).toBe(5);
    expect(pageActions.map((a) => a.id)).toContain('pages-create');
    expect(pageActions.map((a) => a.id)).toContain('pages-archive');
  });

  it('should define database actions', () => {
    const dbActions = notionConnector.actions.filter((a) => a.id.startsWith('databases-'));
    expect(dbActions.length).toBe(2);
  });

  it('should define search action', () => {
    const searchAction = notionConnector.actions.find((a) => a.id === 'search');
    expect(searchAction).toBeDefined();
    expect(searchAction!.sideEffects).toBe(false);
  });

  it('should define block actions', () => {
    const blockActions = notionConnector.actions.filter((a) => a.id.startsWith('blocks-'));
    expect(blockActions.length).toBe(2);
  });

  it('should define page-updated trigger', () => {
    expect(notionConnector.triggers).toHaveLength(1);
    expect(notionConnector.triggers[0].id).toBe('page-updated');
  });

  it('should define entities', () => {
    expect(notionConnector.entities).toHaveLength(3);
    const entityIds = notionConnector.entities.map((e) => e.id);
    expect(entityIds).toContain('page');
    expect(entityIds).toContain('database');
    expect(entityIds).toContain('block');
  });

  it('should execute pages-create action', async () => {
    const result = await notionConnector.executeAction(
      'pages-create',
      { parentId: 'db-1', title: 'Test Page' },
      'token',
    ) as any;
    expect(result.status).toBe('created');
    expect(result.title).toBe('Test Page');
  });

  it('should execute search action', async () => {
    const result = await notionConnector.executeAction(
      'search',
      { query: 'test' },
      'token',
    ) as any;
    expect(result.results).toEqual([]);
    expect(result.query).toBe('test');
  });

  it('should throw for unknown action', async () => {
    await expect(notionConnector.executeAction('unknown', {}, 'token')).rejects.toThrow('Unknown action');
  });
});
