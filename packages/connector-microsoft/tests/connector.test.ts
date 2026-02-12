import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { microsoftConnector } from '../src/connector.js';

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Helper to create a mock Response with JSON body */
function mockJsonResponse(body: unknown, status = 200) {
  return { ok: true, status, json: async () => body, text: async () => JSON.stringify(body) };
}

/** Helper to create a mock 204 No Content response */
function mockNoContentResponse() {
  return { ok: true, status: 204, json: async () => ({}), text: async () => '' };
}

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

  // --- executeAction tests with fetch mocking ---

  it('should execute mail-list-messages action', async () => {
    // graphFetch GET /me/mailFolders/inbox/messages?$top=10 -> { value: [] }
    fetchMock.mockResolvedValueOnce(mockJsonResponse({ value: [] }));
    const result = await microsoftConnector.executeAction('mail-list-messages', {}, 'token');
    expect(result).toEqual({ messages: [], folderId: 'inbox' });
  });

  it('should execute mail-send action', async () => {
    // POST /me/sendMail returns 202 no content; mock as 204 so graphFetch returns undefined
    fetchMock.mockResolvedValueOnce(mockNoContentResponse());
    const result = await microsoftConnector.executeAction('mail-send', { to: 'a@b.com', subject: 'Hi', body: 'Hello' }, 'token') as any;
    expect(result.status).toBe('sent');
  });

  it('should execute mail-reply action', async () => {
    // POST /me/messages/{id}/reply returns no content
    fetchMock.mockResolvedValueOnce(mockNoContentResponse());
    const result = await microsoftConnector.executeAction('mail-reply', { messageId: 'm1', body: 'Reply' }, 'token') as any;
    expect(result.status).toBe('replied');
  });

  it('should execute mail-forward action', async () => {
    // POST /me/messages/{id}/forward returns no content
    fetchMock.mockResolvedValueOnce(mockNoContentResponse());
    const result = await microsoftConnector.executeAction('mail-forward', { messageId: 'm1', to: 'a@b.com' }, 'token') as any;
    expect(result.status).toBe('forwarded');
    expect(result.to).toBe('a@b.com');
  });

  it('should execute mail-move action', async () => {
    // POST /me/messages/{id}/move returns moved message with id
    fetchMock.mockResolvedValueOnce(mockJsonResponse({ id: 'm1-moved' }));
    const result = await microsoftConnector.executeAction('mail-move', { messageId: 'm1', destinationFolderId: 'f1' }, 'token') as any;
    expect(result.status).toBe('moved');
  });

  it('should execute mail-archive action', async () => {
    // POST /me/messages/{id}/move with destinationId: 'archive' returns moved message
    fetchMock.mockResolvedValueOnce(mockJsonResponse({ id: 'm1-archived' }));
    const result = await microsoftConnector.executeAction('mail-archive', { messageId: 'm1' }, 'token') as any;
    expect(result.status).toBe('archived');
  });

  it('should execute mail-flag action', async () => {
    // PATCH /me/messages/{id} returns updated message with id
    fetchMock.mockResolvedValueOnce(mockJsonResponse({ id: 'm1' }));
    const result = await microsoftConnector.executeAction('mail-flag', { messageId: 'm1' }, 'token') as any;
    expect(result.status).toBe('flagged');
  });

  it('should execute calendar-list-events action', async () => {
    // GET /me/events?$top=10&$orderby=start/dateTime -> { value: [] }
    fetchMock.mockResolvedValueOnce(mockJsonResponse({ value: [] }));
    const result = await microsoftConnector.executeAction('calendar-list-events', {}, 'token');
    // Source returns { events: res.value } (no calendarId field)
    expect(result).toEqual({ events: [] });
  });

  it('should execute calendar-create-event action', async () => {
    // POST /me/events returns created event with id and subject
    fetchMock.mockResolvedValueOnce(mockJsonResponse({ id: 'evt1', subject: 'Meeting' }));
    const result = await microsoftConnector.executeAction('calendar-create-event', {
      subject: 'Meeting',
      start: '2025-01-01T10:00:00Z',
      end: '2025-01-01T11:00:00Z',
    }, 'token') as any;
    expect(result.status).toBe('created');
    expect(result.subject).toBe('Meeting');
  });

  it('should execute calendar-delete-event action', async () => {
    // DELETE /me/events/{id} returns 204 no content
    fetchMock.mockResolvedValueOnce(mockNoContentResponse());
    const result = await microsoftConnector.executeAction('calendar-delete-event', { eventId: 'e1' }, 'token') as any;
    expect(result.status).toBe('deleted');
  });

  it('should execute calendar-find-availability action', async () => {
    // POST /me/calendar/getSchedule returns schedule data; source returns res directly
    fetchMock.mockResolvedValueOnce(mockJsonResponse({ slots: [] }));
    const result = await microsoftConnector.executeAction('calendar-find-availability', { attendees: [], startDateTime: '', endDateTime: '' }, 'token');
    expect(result).toEqual({ slots: [] });
  });

  it('should execute contacts-list action', async () => {
    // GET /me/contacts?$top=20 -> { value: [] }
    fetchMock.mockResolvedValueOnce(mockJsonResponse({ value: [] }));
    const result = await microsoftConnector.executeAction('contacts-list', {}, 'token');
    expect(result).toEqual({ contacts: [] });
  });

  it('should execute contacts-get action', async () => {
    // GET /me/contacts/{id} returns contact object; source returns it directly
    fetchMock.mockResolvedValueOnce(mockJsonResponse({ contactId: 'c1' }));
    const result = await microsoftConnector.executeAction('contacts-get', { contactId: 'c1' }, 'token') as any;
    expect(result.contactId).toBe('c1');
  });

  it('should execute files-list action', async () => {
    // GET /me/drive/root/children?$top=20 -> { value: [] }
    fetchMock.mockResolvedValueOnce(mockJsonResponse({ value: [] }));
    const result = await microsoftConnector.executeAction('files-list', {}, 'token');
    expect(result).toEqual({ files: [] });
  });

  it('should execute files-download action', async () => {
    // files-download uses fetch directly (not graphFetch), returns text content
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => 'file-content',
    });
    const result = await microsoftConnector.executeAction('files-download', { fileId: 'f1' }, 'token') as any;
    expect(result.fileId).toBe('f1');
  });

  it('should execute files-upload action', async () => {
    // files-upload uses fetch directly (PUT), returns { id, name }
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: 'uploaded-id', name: 'test.txt' }),
    });
    const result = await microsoftConnector.executeAction('files-upload', { name: 'test.txt', content: 'data' }, 'token') as any;
    expect(result.status).toBe('uploaded');
    expect(result.name).toBe('test.txt');
  });

  it('should execute files-search action', async () => {
    // graphFetch GET /me/drive/root/search(q='...')?$top=10 -> { value: [] }
    fetchMock.mockResolvedValueOnce(mockJsonResponse({ value: [] }));
    const result = await microsoftConnector.executeAction('files-search', { query: 'test' }, 'token') as any;
    expect(result.query).toBe('test');
  });

  it('should throw for unknown action', async () => {
    await expect(microsoftConnector.executeAction('unknown', {}, 'token')).rejects.toThrow('Unknown action');
  });

  it('should return empty events from pollTrigger', async () => {
    // pollTrigger 'new-email' fetches inbox messages, filters by receivedDateTime > lastPollAt
    // Pass current time as lastPollAt so no messages match the filter
    fetchMock.mockResolvedValueOnce(mockJsonResponse({ value: [] }));
    const events = await microsoftConnector.pollTrigger!('new-email', 'token');
    expect(events).toEqual([]);
  });
});
