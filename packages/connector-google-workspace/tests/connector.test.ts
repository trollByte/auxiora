import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock googleapis before importing connector
vi.mock('googleapis', () => {
  const calendarEvents = {
    list: vi.fn(),
    insert: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };
  const calendarFreebusy = { query: vi.fn() };
  const gmailMessages = {
    list: vi.fn(),
    get: vi.fn(),
    send: vi.fn(),
    modify: vi.fn(),
  };
  const gmailDrafts = { create: vi.fn() };
  const driveFiles = {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
  };
  const drivePermissions = { create: vi.fn() };

  const mockAuth = { setCredentials: vi.fn() };

  class MockOAuth2 {
    setCredentials = mockAuth.setCredentials;
  }

  return {
    google: {
      auth: {
        OAuth2: MockOAuth2,
      },
      calendar: vi.fn(() => ({
        events: calendarEvents,
        freebusy: calendarFreebusy,
      })),
      gmail: vi.fn(() => ({
        users: {
          messages: gmailMessages,
          drafts: gmailDrafts,
        },
      })),
      drive: vi.fn(() => ({
        files: driveFiles,
        permissions: drivePermissions,
      })),
    },
    // Expose mocks for test assertions
    __mocks__: {
      calendarEvents,
      calendarFreebusy,
      gmailMessages,
      gmailDrafts,
      driveFiles,
      drivePermissions,
      mockAuth,
    },
  };
});

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
const { __mocks__ } = await import('googleapis') as unknown as {
  __mocks__: {
    calendarEvents: {
      list: ReturnType<typeof vi.fn>;
      insert: ReturnType<typeof vi.fn>;
      patch: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    calendarFreebusy: { query: ReturnType<typeof vi.fn> };
    gmailMessages: {
      list: ReturnType<typeof vi.fn>;
      get: ReturnType<typeof vi.fn>;
      send: ReturnType<typeof vi.fn>;
      modify: ReturnType<typeof vi.fn>;
    };
    gmailDrafts: { create: ReturnType<typeof vi.fn> };
    driveFiles: {
      list: ReturnType<typeof vi.fn>;
      get: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
    drivePermissions: { create: ReturnType<typeof vi.fn> };
    mockAuth: { setCredentials: ReturnType<typeof vi.fn> };
  };
};

const { googleWorkspaceConnector } = await import('../src/connector.js');

const TOKEN = 'test-access-token';

describe('Google Workspace Connector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Metadata ---
  describe('metadata', () => {
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

    it('should define 5 calendar, 6 gmail, and 6 drive actions', () => {
      const calendarActions = googleWorkspaceConnector.actions.filter(a => a.id.startsWith('calendar-'));
      const gmailActions = googleWorkspaceConnector.actions.filter(a => a.id.startsWith('gmail-'));
      const driveActions = googleWorkspaceConnector.actions.filter(a => a.id.startsWith('drive-'));
      expect(calendarActions).toHaveLength(5);
      expect(gmailActions).toHaveLength(6);
      expect(driveActions).toHaveLength(6);
    });

    it('should define 3 triggers', () => {
      expect(googleWorkspaceConnector.triggers).toHaveLength(3);
      const ids = googleWorkspaceConnector.triggers.map(t => t.id);
      expect(ids).toContain('new-email');
      expect(ids).toContain('event-starting-soon');
      expect(ids).toContain('file-shared');
    });

    it('should define 3 entities', () => {
      expect(googleWorkspaceConnector.entities).toHaveLength(3);
    });
  });

  // --- Calendar Actions ---
  describe('calendar-list-events', () => {
    it('should list events with defaults', async () => {
      const items = [{ id: 'e1', summary: 'Meeting' }];
      __mocks__.calendarEvents.list.mockResolvedValue({ data: { items } });

      const result = await googleWorkspaceConnector.executeAction('calendar-list-events', {}, TOKEN) as { events: unknown[] };
      expect(result.events).toEqual(items);
      expect(__mocks__.calendarEvents.list).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: 'primary',
          maxResults: 10,
          singleEvents: true,
          orderBy: 'startTime',
        }),
      );
    });

    it('should pass custom params', async () => {
      __mocks__.calendarEvents.list.mockResolvedValue({ data: { items: [] } });

      await googleWorkspaceConnector.executeAction('calendar-list-events', {
        calendarId: 'work',
        maxResults: 5,
        timeMin: '2026-01-01T00:00:00Z',
        timeMax: '2026-01-02T00:00:00Z',
      }, TOKEN);

      expect(__mocks__.calendarEvents.list).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: 'work',
          maxResults: 5,
          timeMin: '2026-01-01T00:00:00Z',
          timeMax: '2026-01-02T00:00:00Z',
        }),
      );
    });
  });

  describe('calendar-create-event', () => {
    it('should create an event', async () => {
      __mocks__.calendarEvents.insert.mockResolvedValue({
        data: { id: 'evt_1', summary: 'Lunch' },
      });

      const result = await googleWorkspaceConnector.executeAction('calendar-create-event', {
        summary: 'Lunch',
        start: '2026-02-10T12:00:00Z',
        end: '2026-02-10T13:00:00Z',
      }, TOKEN) as { eventId: string; status: string; summary: string };

      expect(result.eventId).toBe('evt_1');
      expect(result.status).toBe('created');
      expect(result.summary).toBe('Lunch');
      expect(__mocks__.calendarEvents.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: 'primary',
          requestBody: expect.objectContaining({
            summary: 'Lunch',
            start: { dateTime: '2026-02-10T12:00:00Z' },
            end: { dateTime: '2026-02-10T13:00:00Z' },
          }),
        }),
      );
    });

    it('should include attendees when provided', async () => {
      __mocks__.calendarEvents.insert.mockResolvedValue({
        data: { id: 'evt_2', summary: 'Team' },
      });

      await googleWorkspaceConnector.executeAction('calendar-create-event', {
        summary: 'Team',
        start: '2026-02-10T12:00:00Z',
        end: '2026-02-10T13:00:00Z',
        attendees: ['a@b.com', 'c@d.com'],
      }, TOKEN);

      expect(__mocks__.calendarEvents.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            attendees: [{ email: 'a@b.com' }, { email: 'c@d.com' }],
          }),
        }),
      );
    });
  });

  describe('calendar-update-event', () => {
    it('should patch an event', async () => {
      __mocks__.calendarEvents.patch.mockResolvedValue({ data: { id: 'evt_1' } });

      const result = await googleWorkspaceConnector.executeAction('calendar-update-event', {
        eventId: 'evt_1',
        summary: 'Updated',
      }, TOKEN) as { eventId: string; status: string };

      expect(result.eventId).toBe('evt_1');
      expect(result.status).toBe('updated');
      expect(__mocks__.calendarEvents.patch).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: 'evt_1',
          requestBody: { summary: 'Updated' },
        }),
      );
    });
  });

  describe('calendar-delete-event', () => {
    it('should delete an event', async () => {
      __mocks__.calendarEvents.delete.mockResolvedValue({});

      const result = await googleWorkspaceConnector.executeAction('calendar-delete-event', {
        eventId: 'evt_1',
      }, TOKEN) as { eventId: string; status: string };

      expect(result.eventId).toBe('evt_1');
      expect(result.status).toBe('deleted');
    });
  });

  describe('calendar-find-free-slots', () => {
    it('should find free slots between busy periods', async () => {
      __mocks__.calendarFreebusy.query.mockResolvedValue({
        data: {
          calendars: {
            primary: {
              busy: [
                { start: '2026-02-10T10:00:00Z', end: '2026-02-10T11:00:00Z' },
                { start: '2026-02-10T14:00:00Z', end: '2026-02-10T15:00:00Z' },
              ],
            },
          },
        },
      });

      const result = await googleWorkspaceConnector.executeAction('calendar-find-free-slots', {
        timeMin: '2026-02-10T09:00:00Z',
        timeMax: '2026-02-10T17:00:00Z',
        durationMinutes: 30,
      }, TOKEN) as { slots: Array<{ start: string; end: string }> };

      expect(result.slots.length).toBe(3);
    });
  });

  // --- Gmail Actions ---
  describe('gmail-list-messages', () => {
    it('should list messages', async () => {
      const messages = [{ id: 'msg1', threadId: 't1' }];
      __mocks__.gmailMessages.list.mockResolvedValue({ data: { messages } });

      const result = await googleWorkspaceConnector.executeAction('gmail-list-messages', {}, TOKEN) as { messages: unknown[] };
      expect(result.messages).toEqual(messages);
      expect(__mocks__.gmailMessages.list).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'me', maxResults: 10 }),
      );
    });
  });

  describe('gmail-read-message', () => {
    it('should read a message and extract body', async () => {
      const bodyData = Buffer.from('Hello world').toString('base64url');
      __mocks__.gmailMessages.get.mockResolvedValue({
        data: {
          id: 'msg1',
          snippet: 'Hello...',
          payload: {
            mimeType: 'text/plain',
            headers: [
              { name: 'Subject', value: 'Test Subject' },
              { name: 'From', value: 'sender@test.com' },
              { name: 'To', value: 'me@test.com' },
              { name: 'Date', value: 'Mon, 10 Feb 2026' },
            ],
            body: { data: bodyData },
          },
        },
      });

      const result = await googleWorkspaceConnector.executeAction('gmail-read-message', {
        messageId: 'msg1',
      }, TOKEN) as { messageId: string; subject: string; from: string; body: string };

      expect(result.messageId).toBe('msg1');
      expect(result.subject).toBe('Test Subject');
      expect(result.from).toBe('sender@test.com');
      expect(result.body).toBe('Hello world');
    });

    it('should extract body from multipart message', async () => {
      const bodyData = Buffer.from('Plain text content').toString('base64url');
      __mocks__.gmailMessages.get.mockResolvedValue({
        data: {
          id: 'msg2',
          snippet: 'Plain...',
          payload: {
            mimeType: 'multipart/alternative',
            headers: [{ name: 'Subject', value: 'Multi' }],
            parts: [
              { mimeType: 'text/plain', body: { data: bodyData } },
              { mimeType: 'text/html', body: { data: Buffer.from('<p>HTML</p>').toString('base64url') } },
            ],
          },
        },
      });

      const result = await googleWorkspaceConnector.executeAction('gmail-read-message', {
        messageId: 'msg2',
      }, TOKEN) as { body: string };

      expect(result.body).toBe('Plain text content');
    });
  });

  describe('gmail-send', () => {
    it('should send an email with RFC 2822 raw format', async () => {
      __mocks__.gmailMessages.send.mockResolvedValue({ data: { id: 'sent_1' } });

      const result = await googleWorkspaceConnector.executeAction('gmail-send', {
        to: 'recipient@test.com',
        subject: 'Hello',
        body: 'World',
      }, TOKEN) as { messageId: string; status: string };

      expect(result.messageId).toBe('sent_1');
      expect(result.status).toBe('sent');
      expect(__mocks__.gmailMessages.send).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'me',
          requestBody: expect.objectContaining({ raw: expect.any(String) }),
        }),
      );
    });
  });

  describe('gmail-draft', () => {
    it('should create a draft', async () => {
      __mocks__.gmailDrafts.create.mockResolvedValue({ data: { id: 'draft_1' } });

      const result = await googleWorkspaceConnector.executeAction('gmail-draft', {
        to: 'r@test.com',
        subject: 'Draft',
        body: 'Content',
      }, TOKEN) as { draftId: string; status: string };

      expect(result.draftId).toBe('draft_1');
      expect(result.status).toBe('created');
    });
  });

  describe('gmail-search', () => {
    it('should search messages', async () => {
      __mocks__.gmailMessages.list.mockResolvedValue({ data: { messages: [{ id: 's1' }] } });

      const result = await googleWorkspaceConnector.executeAction('gmail-search', {
        query: 'from:boss',
      }, TOKEN) as { messages: unknown[]; query: string };

      expect(result.messages).toHaveLength(1);
      expect(result.query).toBe('from:boss');
      expect(__mocks__.gmailMessages.list).toHaveBeenCalledWith(
        expect.objectContaining({ q: 'from:boss' }),
      );
    });
  });

  describe('gmail-archive', () => {
    it('should remove INBOX label', async () => {
      __mocks__.gmailMessages.modify.mockResolvedValue({});

      const result = await googleWorkspaceConnector.executeAction('gmail-archive', {
        messageId: 'msg1',
      }, TOKEN) as { messageId: string; status: string };

      expect(result.status).toBe('archived');
      expect(__mocks__.gmailMessages.modify).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'me',
          id: 'msg1',
          requestBody: { removeLabelIds: ['INBOX'] },
        }),
      );
    });
  });

  // --- Drive Actions ---
  describe('drive-list-files', () => {
    it('should list files', async () => {
      const files = [{ id: 'f1', name: 'doc.txt' }];
      __mocks__.driveFiles.list.mockResolvedValue({ data: { files } });

      const result = await googleWorkspaceConnector.executeAction('drive-list-files', {}, TOKEN) as { files: unknown[] };
      expect(result.files).toEqual(files);
    });
  });

  describe('drive-create-file', () => {
    it('should create a file', async () => {
      __mocks__.driveFiles.create.mockResolvedValue({ data: { id: 'f_new', name: 'test.txt' } });

      const result = await googleWorkspaceConnector.executeAction('drive-create-file', {
        name: 'test.txt',
        content: 'Hello',
      }, TOKEN) as { fileId: string; status: string };

      expect(result.fileId).toBe('f_new');
      expect(result.status).toBe('created');
    });
  });

  describe('drive-upload', () => {
    it('should upload a base64 file', async () => {
      __mocks__.driveFiles.create.mockResolvedValue({ data: { id: 'f_up', name: 'image.png' } });

      const result = await googleWorkspaceConnector.executeAction('drive-upload', {
        name: 'image.png',
        content: Buffer.from('fake-image').toString('base64'),
        mimeType: 'image/png',
      }, TOKEN) as { fileId: string; status: string };

      expect(result.fileId).toBe('f_up');
      expect(result.status).toBe('uploaded');
    });
  });

  describe('drive-search', () => {
    it('should search files by query', async () => {
      __mocks__.driveFiles.list.mockResolvedValue({ data: { files: [{ id: 'f2' }] } });

      const result = await googleWorkspaceConnector.executeAction('drive-search', {
        query: 'report',
      }, TOKEN) as { files: unknown[]; query: string };

      expect(result.files).toHaveLength(1);
      expect(result.query).toBe('report');
    });
  });

  describe('drive-share', () => {
    it('should share a file', async () => {
      __mocks__.drivePermissions.create.mockResolvedValue({});

      const result = await googleWorkspaceConnector.executeAction('drive-share', {
        fileId: 'f1',
        email: 'user@test.com',
        role: 'writer',
      }, TOKEN) as { fileId: string; sharedWith: string; status: string };

      expect(result.status).toBe('shared');
      expect(result.sharedWith).toBe('user@test.com');
      expect(__mocks__.drivePermissions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          fileId: 'f1',
          requestBody: { type: 'user', role: 'writer', emailAddress: 'user@test.com' },
        }),
      );
    });
  });

  // --- Unknown action ---
  describe('unknown action', () => {
    it('should throw for unknown action', async () => {
      await expect(googleWorkspaceConnector.executeAction('unknown', {}, TOKEN)).rejects.toThrow('Unknown action');
    });
  });

  // --- Triggers ---
  describe('pollTrigger', () => {
    it('should poll for new emails', async () => {
      __mocks__.gmailMessages.list.mockResolvedValue({
        data: { messages: [{ id: 'msg_new' }] },
      });

      const events = await googleWorkspaceConnector.pollTrigger!('new-email', TOKEN, Date.now() - 60_000);
      expect(events).toHaveLength(1);
      expect(events[0].triggerId).toBe('new-email');
      expect(events[0].connectorId).toBe('google-workspace');
      expect(events[0].data.messageId).toBe('msg_new');
    });

    it('should poll for events starting soon', async () => {
      __mocks__.calendarEvents.list.mockResolvedValue({
        data: {
          items: [{
            id: 'evt_soon',
            summary: 'Standup',
            start: { dateTime: new Date(Date.now() + 5 * 60_000).toISOString() },
          }],
        },
      });

      const events = await googleWorkspaceConnector.pollTrigger!('event-starting-soon', TOKEN);
      expect(events).toHaveLength(1);
      expect(events[0].triggerId).toBe('event-starting-soon');
      expect(events[0].data.eventId).toBe('evt_soon');
      expect(events[0].data.summary).toBe('Standup');
    });

    it('should poll for shared files', async () => {
      __mocks__.driveFiles.list.mockResolvedValue({
        data: { files: [{ id: 'f_shared', name: 'doc.pdf', mimeType: 'application/pdf' }] },
      });

      const events = await googleWorkspaceConnector.pollTrigger!('file-shared', TOKEN, Date.now() - 300_000);
      expect(events).toHaveLength(1);
      expect(events[0].triggerId).toBe('file-shared');
      expect(events[0].data.fileId).toBe('f_shared');
    });

    it('should return empty for unknown trigger', async () => {
      const events = await googleWorkspaceConnector.pollTrigger!('unknown', TOKEN);
      expect(events).toEqual([]);
    });
  });
});
