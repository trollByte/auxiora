import { describe, it, expect } from 'vitest';
import { microsoftConnector } from '../src/connector.js';

describe('Microsoft 365 Connector', () => {
  it('should have correct metadata', () => {
    expect(microsoftConnector.id).toBe('microsoft-365');
    expect(microsoftConnector.name).toBe('Microsoft 365');
    expect(microsoftConnector.category).toBe('productivity');
    expect(microsoftConnector.version).toBe('1.0.0');
  });

  it('should use OAuth2 authentication with correct URLs', () => {
    expect(microsoftConnector.auth.type).toBe('oauth2');
    expect(microsoftConnector.auth.oauth2).toBeDefined();
    expect(microsoftConnector.auth.oauth2!.authUrl).toBe('https://login.microsoftonline.com/common/oauth2/v2/authorize');
    expect(microsoftConnector.auth.oauth2!.tokenUrl).toBe('https://login.microsoftonline.com/common/oauth2/v2/token');
  });

  it('should have correct OAuth2 scopes', () => {
    const scopes = microsoftConnector.auth.oauth2!.scopes;
    expect(scopes).toContain('Mail.ReadWrite');
    expect(scopes).toContain('Mail.Send');
    expect(scopes).toContain('Calendars.ReadWrite');
    expect(scopes).toContain('Contacts.Read');
    expect(scopes).toContain('Files.ReadWrite');
    expect(scopes).toContain('User.Read');
    expect(scopes).toHaveLength(6);
  });

  it('should define all mail actions', () => {
    const mailActions = microsoftConnector.actions.filter((a) => a.id.startsWith('mail-'));
    expect(mailActions).toHaveLength(10);
    const ids = mailActions.map((a) => a.id);
    expect(ids).toContain('mail-list-messages');
    expect(ids).toContain('mail-read-message');
    expect(ids).toContain('mail-send');
    expect(ids).toContain('mail-reply');
    expect(ids).toContain('mail-forward');
    expect(ids).toContain('mail-move');
    expect(ids).toContain('mail-archive');
    expect(ids).toContain('mail-flag');
    expect(ids).toContain('mail-search');
    expect(ids).toContain('mail-draft');
  });

  it('should define all calendar actions', () => {
    const calendarActions = microsoftConnector.actions.filter((a) => a.id.startsWith('calendar-'));
    expect(calendarActions).toHaveLength(5);
    const ids = calendarActions.map((a) => a.id);
    expect(ids).toContain('calendar-list-events');
    expect(ids).toContain('calendar-create-event');
    expect(ids).toContain('calendar-update-event');
    expect(ids).toContain('calendar-delete-event');
    expect(ids).toContain('calendar-find-availability');
  });

  it('should define all contacts actions', () => {
    const contactsActions = microsoftConnector.actions.filter((a) => a.id.startsWith('contacts-'));
    expect(contactsActions).toHaveLength(2);
    const ids = contactsActions.map((a) => a.id);
    expect(ids).toContain('contacts-list');
    expect(ids).toContain('contacts-get');
  });

  it('should define all files actions', () => {
    const filesActions = microsoftConnector.actions.filter((a) => a.id.startsWith('files-'));
    expect(filesActions).toHaveLength(4);
    const ids = filesActions.map((a) => a.id);
    expect(ids).toContain('files-list');
    expect(ids).toContain('files-download');
    expect(ids).toContain('files-upload');
    expect(ids).toContain('files-search');
  });

  it('should have all actions with required fields', () => {
    for (const action of microsoftConnector.actions) {
      expect(action.id).toBeTruthy();
      expect(action.name).toBeTruthy();
      expect(action.description).toBeTruthy();
      expect(typeof action.trustMinimum).toBe('number');
      expect(action.trustDomain).toBeTruthy();
      expect(typeof action.reversible).toBe('boolean');
      expect(typeof action.sideEffects).toBe('boolean');
      expect(action.params).toBeDefined();
    }
  });

  it('should define triggers', () => {
    expect(microsoftConnector.triggers).toHaveLength(3);
    const triggerIds = microsoftConnector.triggers.map((t) => t.id);
    expect(triggerIds).toContain('new-email');
    expect(triggerIds).toContain('event-starting-soon');
    expect(triggerIds).toContain('calendar-event-created');
  });

  it('should define entities', () => {
    expect(microsoftConnector.entities).toHaveLength(4);
    const entityIds = microsoftConnector.entities.map((e) => e.id);
    expect(entityIds).toContain('email-message');
    expect(entityIds).toContain('calendar-event');
    expect(entityIds).toContain('contact');
    expect(entityIds).toContain('drive-item');
  });

  it('should assign correct trust domains', () => {
    const mailAction = microsoftConnector.actions.find((a) => a.id === 'mail-send');
    expect(mailAction?.trustDomain).toBe('email');

    const calendarAction = microsoftConnector.actions.find((a) => a.id === 'calendar-create-event');
    expect(calendarAction?.trustDomain).toBe('calendar');

    const contactsAction = microsoftConnector.actions.find((a) => a.id === 'contacts-list');
    expect(contactsAction?.trustDomain).toBe('integrations');

    const filesAction = microsoftConnector.actions.find((a) => a.id === 'files-upload');
    expect(filesAction?.trustDomain).toBe('files');
  });

  it('should require higher trust for sending email', () => {
    const sendAction = microsoftConnector.actions.find((a) => a.id === 'mail-send');
    const readAction = microsoftConnector.actions.find((a) => a.id === 'mail-read-message');
    expect(sendAction!.trustMinimum).toBeGreaterThan(readAction!.trustMinimum);
  });

  it('should execute mail-list-messages action', async () => {
    const result = await microsoftConnector.executeAction('mail-list-messages', {}, 'token');
    expect(result).toEqual({ messages: [], folderId: 'inbox' });
  });

  it('should execute mail-send action', async () => {
    const result = await microsoftConnector.executeAction('mail-send', { to: 'a@b.com', subject: 'Hi', body: 'Hello' }, 'token') as any;
    expect(result.status).toBe('sent');
  });

  it('should execute mail-reply action', async () => {
    const result = await microsoftConnector.executeAction('mail-reply', { messageId: 'm1', body: 'Reply' }, 'token') as any;
    expect(result.status).toBe('replied');
  });

  it('should execute mail-forward action', async () => {
    const result = await microsoftConnector.executeAction('mail-forward', { messageId: 'm1', to: 'a@b.com' }, 'token') as any;
    expect(result.status).toBe('forwarded');
    expect(result.to).toBe('a@b.com');
  });

  it('should execute mail-move action', async () => {
    const result = await microsoftConnector.executeAction('mail-move', { messageId: 'm1', destinationFolderId: 'f1' }, 'token') as any;
    expect(result.status).toBe('moved');
  });

  it('should execute mail-archive action', async () => {
    const result = await microsoftConnector.executeAction('mail-archive', { messageId: 'm1' }, 'token') as any;
    expect(result.status).toBe('archived');
  });

  it('should execute mail-flag action', async () => {
    const result = await microsoftConnector.executeAction('mail-flag', { messageId: 'm1' }, 'token') as any;
    expect(result.status).toBe('flagged');
  });

  it('should execute calendar-list-events action', async () => {
    const result = await microsoftConnector.executeAction('calendar-list-events', {}, 'token');
    expect(result).toEqual({ events: [], calendarId: 'primary' });
  });

  it('should execute calendar-create-event action', async () => {
    const result = await microsoftConnector.executeAction('calendar-create-event', { subject: 'Meeting' }, 'token') as any;
    expect(result.status).toBe('created');
    expect(result.subject).toBe('Meeting');
  });

  it('should execute calendar-delete-event action', async () => {
    const result = await microsoftConnector.executeAction('calendar-delete-event', { eventId: 'e1' }, 'token') as any;
    expect(result.status).toBe('deleted');
  });

  it('should execute calendar-find-availability action', async () => {
    const result = await microsoftConnector.executeAction('calendar-find-availability', { attendees: [], startDateTime: '', endDateTime: '' }, 'token');
    expect(result).toEqual({ slots: [] });
  });

  it('should execute contacts-list action', async () => {
    const result = await microsoftConnector.executeAction('contacts-list', {}, 'token');
    expect(result).toEqual({ contacts: [] });
  });

  it('should execute contacts-get action', async () => {
    const result = await microsoftConnector.executeAction('contacts-get', { contactId: 'c1' }, 'token') as any;
    expect(result.contactId).toBe('c1');
  });

  it('should execute files-list action', async () => {
    const result = await microsoftConnector.executeAction('files-list', {}, 'token');
    expect(result).toEqual({ files: [] });
  });

  it('should execute files-download action', async () => {
    const result = await microsoftConnector.executeAction('files-download', { fileId: 'f1' }, 'token') as any;
    expect(result.fileId).toBe('f1');
  });

  it('should execute files-upload action', async () => {
    const result = await microsoftConnector.executeAction('files-upload', { name: 'test.txt', content: 'data' }, 'token') as any;
    expect(result.status).toBe('uploaded');
    expect(result.name).toBe('test.txt');
  });

  it('should execute files-search action', async () => {
    const result = await microsoftConnector.executeAction('files-search', { query: 'test' }, 'token') as any;
    expect(result.query).toBe('test');
  });

  it('should throw for unknown action', async () => {
    await expect(microsoftConnector.executeAction('unknown', {}, 'token')).rejects.toThrow('Unknown action');
  });

  it('should return empty events from pollTrigger', async () => {
    const events = await microsoftConnector.pollTrigger!('new-email', 'token');
    expect(events).toEqual([]);
  });
});
