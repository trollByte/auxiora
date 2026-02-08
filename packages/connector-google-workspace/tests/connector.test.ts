import { describe, it, expect } from 'vitest';
import { googleWorkspaceConnector } from '../src/connector.js';

describe('Google Workspace Connector', () => {
  it('should have correct metadata', () => {
    expect(googleWorkspaceConnector.id).toBe('google-workspace');
    expect(googleWorkspaceConnector.name).toBe('Google Workspace');
    expect(googleWorkspaceConnector.category).toBe('productivity');
    expect(googleWorkspaceConnector.version).toBe('1.0.0');
  });

  it('should use OAuth2 authentication', () => {
    expect(googleWorkspaceConnector.auth.type).toBe('oauth2');
    expect(googleWorkspaceConnector.auth.oauth2).toBeDefined();
    expect(googleWorkspaceConnector.auth.oauth2!.scopes.length).toBeGreaterThan(0);
  });

  it('should define calendar actions', () => {
    const calendarActions = googleWorkspaceConnector.actions.filter((a) => a.id.startsWith('calendar-'));
    expect(calendarActions.length).toBe(5);
    expect(calendarActions.map((a) => a.id)).toContain('calendar-list-events');
    expect(calendarActions.map((a) => a.id)).toContain('calendar-create-event');
    expect(calendarActions.map((a) => a.id)).toContain('calendar-update-event');
    expect(calendarActions.map((a) => a.id)).toContain('calendar-delete-event');
    expect(calendarActions.map((a) => a.id)).toContain('calendar-find-free-slots');
  });

  it('should define gmail actions', () => {
    const gmailActions = googleWorkspaceConnector.actions.filter((a) => a.id.startsWith('gmail-'));
    expect(gmailActions.length).toBe(6);
    expect(gmailActions.map((a) => a.id)).toContain('gmail-send');
    expect(gmailActions.map((a) => a.id)).toContain('gmail-draft');
    expect(gmailActions.map((a) => a.id)).toContain('gmail-search');
  });

  it('should define drive actions', () => {
    const driveActions = googleWorkspaceConnector.actions.filter((a) => a.id.startsWith('drive-'));
    expect(driveActions.length).toBe(6);
    expect(driveActions.map((a) => a.id)).toContain('drive-list-files');
    expect(driveActions.map((a) => a.id)).toContain('drive-share');
  });

  it('should define triggers', () => {
    expect(googleWorkspaceConnector.triggers).toHaveLength(3);
    const triggerIds = googleWorkspaceConnector.triggers.map((t) => t.id);
    expect(triggerIds).toContain('new-email');
    expect(triggerIds).toContain('event-starting-soon');
    expect(triggerIds).toContain('file-shared');
  });

  it('should define entities', () => {
    expect(googleWorkspaceConnector.entities).toHaveLength(3);
    const entityIds = googleWorkspaceConnector.entities.map((e) => e.id);
    expect(entityIds).toContain('calendar-event');
    expect(entityIds).toContain('email-message');
    expect(entityIds).toContain('drive-file');
  });

  it('should assign correct trust domains', () => {
    const calendarAction = googleWorkspaceConnector.actions.find((a) => a.id === 'calendar-create-event');
    expect(calendarAction?.trustDomain).toBe('calendar');

    const gmailAction = googleWorkspaceConnector.actions.find((a) => a.id === 'gmail-send');
    expect(gmailAction?.trustDomain).toBe('email');

    const driveAction = googleWorkspaceConnector.actions.find((a) => a.id === 'drive-create-file');
    expect(driveAction?.trustDomain).toBe('files');
  });

  it('should require higher trust for sending email', () => {
    const sendAction = googleWorkspaceConnector.actions.find((a) => a.id === 'gmail-send');
    const readAction = googleWorkspaceConnector.actions.find((a) => a.id === 'gmail-read-message');
    expect(sendAction!.trustMinimum).toBeGreaterThan(readAction!.trustMinimum);
  });

  it('should execute calendar-list-events action', async () => {
    const result = await googleWorkspaceConnector.executeAction('calendar-list-events', {}, 'token');
    expect(result).toEqual({ events: [], calendarId: 'primary' });
  });

  it('should execute calendar-create-event action', async () => {
    const result = await googleWorkspaceConnector.executeAction('calendar-create-event', { summary: 'Test' }, 'token') as any;
    expect(result.status).toBe('created');
    expect(result.summary).toBe('Test');
  });

  it('should execute gmail-send action', async () => {
    const result = await googleWorkspaceConnector.executeAction('gmail-send', { to: 'a@b.com', subject: 'Hi', body: 'Hello' }, 'token') as any;
    expect(result.status).toBe('sent');
  });

  it('should execute drive-share action', async () => {
    const result = await googleWorkspaceConnector.executeAction('drive-share', { fileId: 'f1', email: 'a@b.com' }, 'token') as any;
    expect(result.status).toBe('shared');
    expect(result.sharedWith).toBe('a@b.com');
  });

  it('should throw for unknown action', async () => {
    await expect(googleWorkspaceConnector.executeAction('unknown', {}, 'token')).rejects.toThrow('Unknown action');
  });

  it('should return empty events from pollTrigger', async () => {
    const events = await googleWorkspaceConnector.pollTrigger!('new-email', 'token');
    expect(events).toEqual([]);
  });
});
