import { defineConnector } from '@auxiora/connectors';
import type { TriggerEvent } from '@auxiora/connectors';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

async function graphFetch(token: string, path: string, options?: { method?: string; body?: unknown }) {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method: options?.method ?? 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(`Graph API error: ${res.status} ${err.error?.message ?? res.statusText}`);
  }
  if (res.status === 204) return undefined;
  return res.json();
}

export const microsoftConnector = defineConnector({
  id: 'microsoft-365',
  name: 'Microsoft 365',
  description: 'Integration with Outlook Mail, Calendar, OneDrive, and Contacts via Microsoft Graph API',
  version: '1.0.0',
  category: 'productivity',
  icon: 'microsoft',

  auth: {
    type: 'oauth2',
    oauth2: {
      authUrl: 'https://login.microsoftonline.com/common/oauth2/v2/authorize',
      tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2/token',
      scopes: [
        'Mail.ReadWrite',
        'Mail.Send',
        'Calendars.ReadWrite',
        'Contacts.Read',
        'Files.ReadWrite',
        'User.Read',
      ],
    },
  },

  actions: [
    // --- Mail ---
    {
      id: 'mail-list-messages',
      name: 'List Mail Messages',
      description: 'List recent emails from Outlook',
      trustMinimum: 1,
      trustDomain: 'email',
      reversible: false,
      sideEffects: false,
      params: {
        folderId: { type: 'string', description: 'Mail folder ID' },
        maxResults: { type: 'number', description: 'Max messages to return', default: 10 },
        query: { type: 'string', description: 'OData filter query' },
      },
    },
    {
      id: 'mail-read-message',
      name: 'Read Mail Message',
      description: 'Read a specific email message',
      trustMinimum: 1,
      trustDomain: 'email',
      reversible: false,
      sideEffects: false,
      params: {
        messageId: { type: 'string', description: 'Message ID', required: true },
      },
    },
    {
      id: 'mail-send',
      name: 'Send Email',
      description: 'Send an email via Outlook',
      trustMinimum: 3,
      trustDomain: 'email',
      reversible: false,
      sideEffects: true,
      params: {
        to: { type: 'string', description: 'Recipient email', required: true },
        subject: { type: 'string', description: 'Email subject', required: true },
        body: { type: 'string', description: 'Email body', required: true },
        cc: { type: 'string', description: 'CC recipients' },
        bcc: { type: 'string', description: 'BCC recipients' },
      },
    },
    {
      id: 'mail-reply',
      name: 'Reply to Email',
      description: 'Reply to an email message',
      trustMinimum: 3,
      trustDomain: 'email',
      reversible: false,
      sideEffects: true,
      params: {
        messageId: { type: 'string', description: 'Message ID to reply to', required: true },
        body: { type: 'string', description: 'Reply body', required: true },
        replyAll: { type: 'boolean', description: 'Reply to all recipients' },
      },
    },
    {
      id: 'mail-forward',
      name: 'Forward Email',
      description: 'Forward an email message',
      trustMinimum: 3,
      trustDomain: 'email',
      reversible: false,
      sideEffects: true,
      params: {
        messageId: { type: 'string', description: 'Message ID to forward', required: true },
        to: { type: 'string', description: 'Recipient email', required: true },
        comment: { type: 'string', description: 'Comment to include' },
      },
    },
    {
      id: 'mail-move',
      name: 'Move Email',
      description: 'Move an email to a different folder',
      trustMinimum: 2,
      trustDomain: 'email',
      reversible: true,
      sideEffects: true,
      params: {
        messageId: { type: 'string', description: 'Message ID', required: true },
        destinationFolderId: { type: 'string', description: 'Destination folder ID', required: true },
      },
    },
    {
      id: 'mail-archive',
      name: 'Archive Email',
      description: 'Archive an email message',
      trustMinimum: 2,
      trustDomain: 'email',
      reversible: true,
      sideEffects: true,
      params: {
        messageId: { type: 'string', description: 'Message ID', required: true },
      },
    },
    {
      id: 'mail-flag',
      name: 'Flag Email',
      description: 'Flag an email message for follow-up',
      trustMinimum: 1,
      trustDomain: 'email',
      reversible: true,
      sideEffects: true,
      params: {
        messageId: { type: 'string', description: 'Message ID', required: true },
        flagStatus: { type: 'string', description: 'Flag status', default: 'flagged' },
      },
    },
    {
      id: 'mail-search',
      name: 'Search Mail',
      description: 'Search emails in Outlook',
      trustMinimum: 1,
      trustDomain: 'email',
      reversible: false,
      sideEffects: false,
      params: {
        query: { type: 'string', description: 'Search query', required: true },
        maxResults: { type: 'number', description: 'Max results', default: 10 },
      },
    },
    {
      id: 'mail-draft',
      name: 'Create Draft',
      description: 'Create a draft email in Outlook',
      trustMinimum: 2,
      trustDomain: 'email',
      reversible: true,
      sideEffects: true,
      params: {
        to: { type: 'string', description: 'Recipient email', required: true },
        subject: { type: 'string', description: 'Email subject', required: true },
        body: { type: 'string', description: 'Email body', required: true },
      },
    },
    // --- Calendar ---
    {
      id: 'calendar-list-events',
      name: 'List Calendar Events',
      description: 'List upcoming events from Outlook Calendar',
      trustMinimum: 1,
      trustDomain: 'calendar',
      reversible: false,
      sideEffects: false,
      params: {
        calendarId: { type: 'string', description: 'Calendar ID' },
        maxResults: { type: 'number', description: 'Max events to return', default: 10 },
        startDateTime: { type: 'string', description: 'Start time (ISO 8601)' },
        endDateTime: { type: 'string', description: 'End time (ISO 8601)' },
      },
    },
    {
      id: 'calendar-create-event',
      name: 'Create Calendar Event',
      description: 'Create a new event in Outlook Calendar',
      trustMinimum: 2,
      trustDomain: 'calendar',
      reversible: true,
      sideEffects: true,
      params: {
        subject: { type: 'string', description: 'Event subject', required: true },
        start: { type: 'string', description: 'Start time (ISO 8601)', required: true },
        end: { type: 'string', description: 'End time (ISO 8601)', required: true },
        body: { type: 'string', description: 'Event body' },
        attendees: { type: 'array', description: 'List of attendee emails' },
        location: { type: 'string', description: 'Event location' },
        isOnlineMeeting: { type: 'boolean', description: 'Create as online meeting' },
      },
    },
    {
      id: 'calendar-update-event',
      name: 'Update Calendar Event',
      description: 'Update an existing calendar event',
      trustMinimum: 2,
      trustDomain: 'calendar',
      reversible: true,
      sideEffects: true,
      params: {
        eventId: { type: 'string', description: 'Event ID', required: true },
        subject: { type: 'string', description: 'Updated subject' },
        start: { type: 'string', description: 'Updated start time' },
        end: { type: 'string', description: 'Updated end time' },
      },
    },
    {
      id: 'calendar-delete-event',
      name: 'Delete Calendar Event',
      description: 'Delete a calendar event',
      trustMinimum: 3,
      trustDomain: 'calendar',
      reversible: false,
      sideEffects: true,
      params: {
        eventId: { type: 'string', description: 'Event ID', required: true },
      },
    },
    {
      id: 'calendar-find-availability',
      name: 'Find Availability',
      description: 'Find free time slots for attendees',
      trustMinimum: 1,
      trustDomain: 'calendar',
      reversible: false,
      sideEffects: false,
      params: {
        attendees: { type: 'array', description: 'List of attendee emails', required: true },
        startDateTime: { type: 'string', description: 'Start of window (ISO 8601)', required: true },
        endDateTime: { type: 'string', description: 'End of window (ISO 8601)', required: true },
        durationMinutes: { type: 'number', description: 'Desired slot duration in minutes', default: 30 },
      },
    },
    // --- Contacts ---
    {
      id: 'contacts-list',
      name: 'List Contacts',
      description: 'List contacts from Outlook',
      trustMinimum: 1,
      trustDomain: 'integrations',
      reversible: false,
      sideEffects: false,
      params: {
        maxResults: { type: 'number', description: 'Max contacts to return', default: 20 },
        search: { type: 'string', description: 'Search query' },
      },
    },
    {
      id: 'contacts-get',
      name: 'Get Contact',
      description: 'Get a specific contact',
      trustMinimum: 1,
      trustDomain: 'integrations',
      reversible: false,
      sideEffects: false,
      params: {
        contactId: { type: 'string', description: 'Contact ID', required: true },
      },
    },
    // --- OneDrive ---
    {
      id: 'files-list',
      name: 'List OneDrive Files',
      description: 'List files in OneDrive',
      trustMinimum: 1,
      trustDomain: 'files',
      reversible: false,
      sideEffects: false,
      params: {
        folderId: { type: 'string', description: 'Folder ID (default: root)' },
        maxResults: { type: 'number', description: 'Max files to return', default: 20 },
      },
    },
    {
      id: 'files-download',
      name: 'Download File',
      description: 'Download a file from OneDrive',
      trustMinimum: 1,
      trustDomain: 'files',
      reversible: false,
      sideEffects: false,
      params: {
        fileId: { type: 'string', description: 'File ID', required: true },
      },
    },
    {
      id: 'files-upload',
      name: 'Upload File',
      description: 'Upload a file to OneDrive',
      trustMinimum: 2,
      trustDomain: 'files',
      reversible: true,
      sideEffects: true,
      params: {
        name: { type: 'string', description: 'File name', required: true },
        content: { type: 'string', description: 'File content', required: true },
        folderId: { type: 'string', description: 'Parent folder ID' },
      },
    },
    {
      id: 'files-search',
      name: 'Search Files',
      description: 'Search files in OneDrive',
      trustMinimum: 1,
      trustDomain: 'files',
      reversible: false,
      sideEffects: false,
      params: {
        query: { type: 'string', description: 'Search query', required: true },
        maxResults: { type: 'number', description: 'Max results', default: 10 },
      },
    },
  ],

  triggers: [
    {
      id: 'new-email',
      name: 'New Email',
      description: 'Triggered when a new email arrives',
      type: 'poll',
      pollIntervalMs: 60_000,
    },
    {
      id: 'event-starting-soon',
      name: 'Event Starting Soon',
      description: 'Triggered when a calendar event is about to start',
      type: 'poll',
      pollIntervalMs: 60_000,
    },
    {
      id: 'calendar-event-created',
      name: 'Calendar Event Created',
      description: 'Triggered when a new calendar event is created',
      type: 'poll',
      pollIntervalMs: 300_000,
    },
  ],

  entities: [
    {
      id: 'email-message',
      name: 'Email Message',
      description: 'An Outlook email message',
      fields: { id: 'string', from: 'string', to: 'string', subject: 'string', bodyPreview: 'string', receivedDateTime: 'string', importance: 'string', isRead: 'string' },
    },
    {
      id: 'calendar-event',
      name: 'Calendar Event',
      description: 'An Outlook Calendar event',
      fields: { id: 'string', subject: 'string', start: 'string', end: 'string', attendees: 'array', location: 'string', isOnlineMeeting: 'string' },
    },
    {
      id: 'contact',
      name: 'Contact',
      description: 'An Outlook contact',
      fields: { id: 'string', displayName: 'string', emailAddresses: 'array', companyName: 'string', jobTitle: 'string' },
    },
    {
      id: 'drive-item',
      name: 'Drive Item',
      description: 'A OneDrive file or folder',
      fields: { id: 'string', name: 'string', size: 'number', lastModifiedDateTime: 'string', webUrl: 'string' },
    },
  ],

  async executeAction(actionId: string, params: Record<string, unknown>, token: string): Promise<unknown> {
    switch (actionId) {
      // --- Mail ---
      case 'mail-list-messages': {
        const folderId = (params.folderId as string) ?? 'inbox';
        const top = (params.maxResults as number) ?? 10;
        let path = `/me/mailFolders/${encodeURIComponent(folderId)}/messages?$top=${top}`;
        if (params.query) path += `&$filter=${encodeURIComponent(params.query as string)}`;
        const res = await graphFetch(token, path) as { value: unknown[] };
        return { messages: res.value, folderId };
      }

      case 'mail-read-message': {
        const msg = await graphFetch(token, `/me/messages/${encodeURIComponent(params.messageId as string)}`);
        return msg;
      }

      case 'mail-send': {
        const toRecipients = [{ emailAddress: { address: params.to as string } }];
        const ccRecipients = params.cc
          ? (params.cc as string).split(',').map(e => ({ emailAddress: { address: e.trim() } }))
          : undefined;
        const bccRecipients = params.bcc
          ? (params.bcc as string).split(',').map(e => ({ emailAddress: { address: e.trim() } }))
          : undefined;
        await graphFetch(token, '/me/sendMail', {
          method: 'POST',
          body: {
            message: {
              toRecipients,
              subject: params.subject as string,
              body: { contentType: 'Text', content: params.body as string },
              ...(ccRecipients ? { ccRecipients } : {}),
              ...(bccRecipients ? { bccRecipients } : {}),
            },
          },
        });
        return { status: 'sent' };
      }

      case 'mail-reply': {
        const action = params.replyAll ? 'replyAll' : 'reply';
        await graphFetch(token, `/me/messages/${encodeURIComponent(params.messageId as string)}/${action}`, {
          method: 'POST',
          body: { comment: params.body as string },
        });
        return { messageId: params.messageId, status: 'replied' };
      }

      case 'mail-forward': {
        await graphFetch(token, `/me/messages/${encodeURIComponent(params.messageId as string)}/forward`, {
          method: 'POST',
          body: {
            toRecipients: [{ emailAddress: { address: params.to as string } }],
            comment: (params.comment as string) ?? '',
          },
        });
        return { messageId: params.messageId, status: 'forwarded', to: params.to };
      }

      case 'mail-move': {
        const moved = await graphFetch(token, `/me/messages/${encodeURIComponent(params.messageId as string)}/move`, {
          method: 'POST',
          body: { destinationId: params.destinationFolderId as string },
        });
        return { messageId: (moved as { id: string }).id, status: 'moved', destinationFolderId: params.destinationFolderId };
      }

      case 'mail-archive': {
        const archived = await graphFetch(token, `/me/messages/${encodeURIComponent(params.messageId as string)}/move`, {
          method: 'POST',
          body: { destinationId: 'archive' },
        });
        return { messageId: (archived as { id: string }).id, status: 'archived' };
      }

      case 'mail-flag': {
        const flagged = await graphFetch(token, `/me/messages/${encodeURIComponent(params.messageId as string)}`, {
          method: 'PATCH',
          body: { flag: { flagStatus: (params.flagStatus as string) ?? 'flagged' } },
        });
        return { messageId: (flagged as { id: string }).id, status: 'flagged' };
      }

      case 'mail-search': {
        const top = (params.maxResults as number) ?? 10;
        const query = encodeURIComponent(`"${params.query as string}"`);
        const res = await graphFetch(token, `/me/messages?$search=${query}&$top=${top}`) as { value: unknown[] };
        return { messages: res.value, query: params.query };
      }

      case 'mail-draft': {
        const draft = await graphFetch(token, '/me/messages', {
          method: 'POST',
          body: {
            toRecipients: [{ emailAddress: { address: params.to as string } }],
            subject: params.subject as string,
            body: { contentType: 'Text', content: params.body as string },
            isDraft: true,
          },
        }) as { id: string };
        return { draftId: draft.id, status: 'created' };
      }

      // --- Calendar ---
      case 'calendar-list-events': {
        const top = (params.maxResults as number) ?? 10;
        let res: { value: unknown[] };
        if (params.startDateTime && params.endDateTime) {
          const start = encodeURIComponent(params.startDateTime as string);
          const end = encodeURIComponent(params.endDateTime as string);
          res = await graphFetch(token, `/me/calendarView?startDateTime=${start}&endDateTime=${end}&$top=${top}`) as { value: unknown[] };
        } else {
          res = await graphFetch(token, `/me/events?$top=${top}&$orderby=start/dateTime`) as { value: unknown[] };
        }
        return { events: res.value };
      }

      case 'calendar-create-event': {
        const attendees = params.attendees
          ? (params.attendees as string[]).map(email => ({
              emailAddress: { address: email },
              type: 'required',
            }))
          : undefined;
        const eventBody: Record<string, unknown> = {
          subject: params.subject as string,
          start: { dateTime: params.start as string, timeZone: 'UTC' },
          end: { dateTime: params.end as string, timeZone: 'UTC' },
        };
        if (params.body) eventBody.body = { contentType: 'Text', content: params.body as string };
        if (attendees) eventBody.attendees = attendees;
        if (params.location) eventBody.location = { displayName: params.location as string };
        if (params.isOnlineMeeting) eventBody.isOnlineMeeting = true;
        const created = await graphFetch(token, '/me/events', {
          method: 'POST',
          body: eventBody,
        }) as { id: string; subject: string };
        return { eventId: created.id, status: 'created', subject: created.subject };
      }

      case 'calendar-update-event': {
        const updates: Record<string, unknown> = {};
        if (params.subject) updates.subject = params.subject;
        if (params.start) updates.start = { dateTime: params.start as string, timeZone: 'UTC' };
        if (params.end) updates.end = { dateTime: params.end as string, timeZone: 'UTC' };
        const updated = await graphFetch(token, `/me/events/${encodeURIComponent(params.eventId as string)}`, {
          method: 'PATCH',
          body: updates,
        }) as { id: string };
        return { eventId: updated.id, status: 'updated' };
      }

      case 'calendar-delete-event': {
        await graphFetch(token, `/me/events/${encodeURIComponent(params.eventId as string)}`, {
          method: 'DELETE',
        });
        return { eventId: params.eventId, status: 'deleted' };
      }

      case 'calendar-find-availability': {
        const schedules = (params.attendees as string[]);
        const res = await graphFetch(token, '/me/calendar/getSchedule', {
          method: 'POST',
          body: {
            schedules,
            startTime: { dateTime: params.startDateTime as string, timeZone: 'UTC' },
            endTime: { dateTime: params.endDateTime as string, timeZone: 'UTC' },
            availabilityViewInterval: (params.durationMinutes as number) ?? 30,
          },
        });
        return res;
      }

      // --- Contacts ---
      case 'contacts-list': {
        const top = (params.maxResults as number) ?? 20;
        let path = `/me/contacts?$top=${top}`;
        if (params.search) path += `&$search="${encodeURIComponent(params.search as string)}"`;
        const res = await graphFetch(token, path) as { value: unknown[] };
        return { contacts: res.value };
      }

      case 'contacts-get': {
        const contact = await graphFetch(token, `/me/contacts/${encodeURIComponent(params.contactId as string)}`);
        return contact;
      }

      // --- OneDrive ---
      case 'files-list': {
        const top = (params.maxResults as number) ?? 20;
        const path = params.folderId
          ? `/me/drive/items/${encodeURIComponent(params.folderId as string)}/children?$top=${top}`
          : `/me/drive/root/children?$top=${top}`;
        const res = await graphFetch(token, path) as { value: unknown[] };
        return { files: res.value };
      }

      case 'files-download': {
        const downloadRes = await fetch(`${GRAPH_BASE}/me/drive/items/${encodeURIComponent(params.fileId as string)}/content`, {
          headers: { 'Authorization': `Bearer ${token}` },
          redirect: 'follow',
        });
        if (!downloadRes.ok) {
          throw new Error(`Graph API error: ${downloadRes.status} ${downloadRes.statusText}`);
        }
        const content = await downloadRes.text();
        return { fileId: params.fileId, content };
      }

      case 'files-upload': {
        const fileName = encodeURIComponent(params.name as string);
        const uploadPath = params.folderId
          ? `/me/drive/items/${encodeURIComponent(params.folderId as string)}:/${fileName}:/content`
          : `/me/drive/root:/${fileName}:/content`;
        const uploadRes = await fetch(`${GRAPH_BASE}${uploadPath}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/octet-stream',
          },
          body: params.content as string,
        });
        if (!uploadRes.ok) {
          const err = await uploadRes.json().catch(() => ({})) as { error?: { message?: string } };
          throw new Error(`Graph API error: ${uploadRes.status} ${err.error?.message ?? uploadRes.statusText}`);
        }
        const uploaded = await uploadRes.json() as { id: string; name: string };
        return { fileId: uploaded.id, status: 'uploaded', name: uploaded.name };
      }

      case 'files-search': {
        const q = encodeURIComponent(params.query as string);
        const top = (params.maxResults as number) ?? 10;
        const res = await graphFetch(token, `/me/drive/root/search(q='${q}')?$top=${top}`) as { value: unknown[] };
        return { files: res.value, query: params.query };
      }

      default:
        throw new Error(`Unknown action: ${actionId}`);
    }
  },

  async pollTrigger(triggerId: string, token: string, lastPollAt?: number): Promise<TriggerEvent[]> {
    switch (triggerId) {
      case 'new-email': {
        const res = await graphFetch(token, '/me/mailFolders/inbox/messages?$orderby=receivedDateTime desc&$top=10') as { value: Array<{ id: string; receivedDateTime: string; subject?: string; from?: unknown }> };
        const since = lastPollAt ?? (Date.now() - 120_000);
        const newMessages = res.value.filter(m => new Date(m.receivedDateTime).getTime() > since);
        return newMessages.map(m => ({
          triggerId: 'new-email',
          connectorId: 'microsoft-365',
          timestamp: new Date(m.receivedDateTime).getTime(),
          data: { messageId: m.id, subject: m.subject, from: m.from },
        }));
      }

      case 'event-starting-soon': {
        const now = new Date();
        const soon = new Date(now.getTime() + 15 * 60_000);
        const start = encodeURIComponent(now.toISOString());
        const end = encodeURIComponent(soon.toISOString());
        const res = await graphFetch(token, `/me/calendarView?startDateTime=${start}&endDateTime=${end}&$top=10`) as { value: Array<{ id: string; subject?: string; start?: unknown; end?: unknown }> };
        return res.value.map(e => ({
          triggerId: 'event-starting-soon',
          connectorId: 'microsoft-365',
          timestamp: Date.now(),
          data: { eventId: e.id, subject: e.subject, start: e.start, end: e.end },
        }));
      }

      case 'calendar-event-created': {
        const res = await graphFetch(token, '/me/events?$orderby=createdDateTime desc&$top=10') as { value: Array<{ id: string; createdDateTime: string; subject?: string; start?: unknown }> };
        const since = lastPollAt ?? (Date.now() - 300_000);
        const newEvents = res.value.filter(e => new Date(e.createdDateTime).getTime() > since);
        return newEvents.map(e => ({
          triggerId: 'calendar-event-created',
          connectorId: 'microsoft-365',
          timestamp: new Date(e.createdDateTime).getTime(),
          data: { eventId: e.id, subject: e.subject, start: e.start },
        }));
      }

      default:
        return [];
    }
  },
});
