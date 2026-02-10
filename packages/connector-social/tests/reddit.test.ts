import { describe, it, expect } from 'vitest';
import { redditConnector } from '../src/reddit.js';

describe('Reddit Connector', () => {
  it('should have correct metadata', () => {
    expect(redditConnector.id).toBe('reddit');
    expect(redditConnector.name).toBe('Reddit');
    expect(redditConnector.version).toBe('1.0.0');
    expect(redditConnector.category).toBe('social');
  });

  it('should use OAuth2 authentication', () => {
    expect(redditConnector.auth.type).toBe('oauth2');
    expect(redditConnector.auth.oauth2).toBeDefined();
    expect(redditConnector.auth.oauth2!.authUrl).toBe('https://www.reddit.com/api/v1/authorize');
    expect(redditConnector.auth.oauth2!.tokenUrl).toBe('https://www.reddit.com/api/v1/access_token');
    expect(redditConnector.auth.oauth2!.scopes).toContain('submit');
    expect(redditConnector.auth.oauth2!.scopes).toContain('vote');
    expect(redditConnector.auth.oauth2!.scopes.length).toBe(6);
  });

  it('should define all 8 actions', () => {
    expect(redditConnector.actions).toHaveLength(8);
    const actionIds = redditConnector.actions.map((a) => a.id);
    expect(actionIds).toContain('front-page');
    expect(actionIds).toContain('subreddit-read');
    expect(actionIds).toContain('post-submit');
    expect(actionIds).toContain('comment');
    expect(actionIds).toContain('inbox-read');
    expect(actionIds).toContain('search');
    expect(actionIds).toContain('save-post');
    expect(actionIds).toContain('upvote');
  });

  it('should have correct trust levels', () => {
    const readAction = redditConnector.actions.find((a) => a.id === 'front-page');
    expect(readAction!.trustMinimum).toBe(1);

    const submitAction = redditConnector.actions.find((a) => a.id === 'post-submit');
    expect(submitAction!.trustMinimum).toBe(3);
    expect(submitAction!.sideEffects).toBe(true);

    const voteAction = redditConnector.actions.find((a) => a.id === 'upvote');
    expect(voteAction!.trustMinimum).toBe(2);
    expect(voteAction!.reversible).toBe(true);
  });

  it('should mark save-post as reversible', () => {
    const saveAction = redditConnector.actions.find((a) => a.id === 'save-post');
    expect(saveAction!.reversible).toBe(true);
    expect(saveAction!.sideEffects).toBe(true);
    expect(saveAction!.trustMinimum).toBe(1);
  });

  it('should execute front-page action', async () => {
    const result = await redditConnector.executeAction('front-page', {}, 'token');
    expect(result).toEqual({ posts: [] });
  });

  it('should execute subreddit-read action', async () => {
    const result = await redditConnector.executeAction('subreddit-read', { subreddit: 'typescript' }, 'token') as any;
    expect(result.subreddit).toBe('typescript');
  });

  it('should execute post-submit action', async () => {
    const result = await redditConnector.executeAction('post-submit', { subreddit: 'test', title: 'Title', body: 'Body' }, 'token') as any;
    expect(result.status).toBe('submitted');
    expect(result.subreddit).toBe('test');
  });

  it('should execute upvote action with default direction', async () => {
    const result = await redditConnector.executeAction('upvote', { postId: 'p1' }, 'token') as any;
    expect(result.status).toBe('voted');
    expect(result.direction).toBe('up');
  });

  it('should throw for unknown action', async () => {
    await expect(redditConnector.executeAction('unknown', {}, 'token')).rejects.toThrow('Unknown action');
  });

  it('should return empty events from pollTrigger', async () => {
    const events = await redditConnector.pollTrigger!('new-inbox', 'token');
    expect(events).toEqual([]);
  });

  it('should define triggers', () => {
    expect(redditConnector.triggers).toHaveLength(2);
    const triggerIds = redditConnector.triggers.map((t) => t.id);
    expect(triggerIds).toContain('new-inbox');
    expect(triggerIds).toContain('subreddit-new');
  });

  it('should define entities', () => {
    expect(redditConnector.entities).toHaveLength(2);
    const entityIds = redditConnector.entities.map((e) => e.id);
    expect(entityIds).toContain('post');
    expect(entityIds).toContain('comment');
  });
});
