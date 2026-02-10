import { Readable } from 'node:stream';
import { defineConnector } from '@auxiora/connectors';
import type { TriggerEvent } from '@auxiora/connectors';
import { createGoogleClient } from './google-client.js';

/** Decode a base64url-encoded string to UTF-8. */
function base64urlDecode(data: string): string {
  return Buffer.from(data, 'base64url').toString('utf-8');
}

/** Extract the plain-text body from a Gmail message payload. */
function extractBody(payload: { mimeType?: string | null; body?: { data?: string | null } | null; parts?: Array<{ mimeType?: string | null; body?: { data?: string | null } | null; parts?: unknown[] }> | null } | null | undefined): string {
  if (!payload) return '';

  // Direct body on simple messages
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return base64urlDecode(payload.body.data);
  }

  // Multipart: look for text/plain first, then text/html
  if (payload.parts) {
    const plainPart = payload.parts.find(p => p.mimeType === 'text/plain');
    if (plainPart?.body?.data) {
      return base64urlDecode(plainPart.body.data);
    }
    const htmlPart = payload.parts.find(p => p.mimeType === 'text/html');
    if (htmlPart?.body?.data) {
      return base64urlDecode(htmlPart.body.data);
    }
  }

  // Fallback: any body data
  if (payload.body?.data) {
    return base64urlDecode(payload.body.data);
  }

  return '';
}

export const googleWorkspaceConnector = defineConnector({
  id: 'google-workspace',
  name: 'Google Workspace',
  description: 'Integration with Google Calendar, Gmail, and Drive',
  version: '1.0.0',
  category: 'productivity',
  icon: 'google',

  auth: {
    type: 'oauth2',
    oauth2: {
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scopes: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/drive',
      ],
    },
  },

  actions: [
    // --- Calendar ---
    {
      id: 'calendar-list-events',
      name: 'List Calendar Events',
      description: 'List upcoming events from Google Calendar',
      trustMinimum: 1,
      trustDomain: 'calendar',
      reversible: false,
      sideEffects: false,
      params: {
        calendarId: { type: 'string', description: 'Calendar ID (default: primary)', default: 'primary' },
        maxResults: { type: 'number', description: 'Max events to return', default: 10 },
        timeMin: { type: 'string', description: 'Start time (ISO 8601)' },
        timeMax: { type: 'string', description: 'End time (ISO 8601)' },
      },
    },
    {
      id: 'calendar-create-event',
      name: 'Create Calendar Event',
      description: 'Create a new event in Google Calendar',
      trustMinimum: 2,
      trustDomain: 'calendar',
      reversible: true,
      sideEffects: true,
      params: {
        summary: { type: 'string', description: 'Event title', required: true },
        start: { type: 'string', description: 'Start time (ISO 8601)', required: true },
        end: { type: 'string', description: 'End time (ISO 8601)', required: true },
        description: { type: 'string', description: 'Event description' },
        attendees: { type: 'array', description: 'List of attendee emails' },
        calendarId: { type: 'string', description: 'Calendar ID', default: 'primary' },
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
        summary: { type: 'string', description: 'Updated title' },
        start: { type: 'string', description: 'Updated start time' },
        end: { type: 'string', description: 'Updated end time' },
        calendarId: { type: 'string', description: 'Calendar ID', default: 'primary' },
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
        calendarId: { type: 'string', description: 'Calendar ID', default: 'primary' },
      },
    },
    {
      id: 'calendar-find-free-slots',
      name: 'Find Free Slots',
      description: 'Find free time slots across calendars',
      trustMinimum: 1,
      trustDomain: 'calendar',
      reversible: false,
      sideEffects: false,
      params: {
        timeMin: { type: 'string', description: 'Start of window (ISO 8601)', required: true },
        timeMax: { type: 'string', description: 'End of window (ISO 8601)', required: true },
        calendarIds: { type: 'array', description: 'Calendar IDs to check' },
        durationMinutes: { type: 'number', description: 'Desired slot duration in minutes', default: 30 },
      },
    },
    // --- Gmail ---
    {
      id: 'gmail-list-messages',
      name: 'List Gmail Messages',
      description: 'List recent emails from Gmail',
      trustMinimum: 1,
      trustDomain: 'email',
      reversible: false,
      sideEffects: false,
      params: {
        maxResults: { type: 'number', description: 'Max messages to return', default: 10 },
        query: { type: 'string', description: 'Gmail search query' },
        labelIds: { type: 'array', description: 'Label IDs to filter by' },
      },
    },
    {
      id: 'gmail-read-message',
      name: 'Read Gmail Message',
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
      id: 'gmail-send',
      name: 'Send Email',
      description: 'Send an email via Gmail',
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
      id: 'gmail-draft',
      name: 'Create Draft',
      description: 'Create a draft email in Gmail',
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
    {
      id: 'gmail-search',
      name: 'Search Gmail',
      description: 'Search emails in Gmail',
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
      id: 'gmail-archive',
      name: 'Archive Email',
      description: 'Archive a Gmail message',
      trustMinimum: 2,
      trustDomain: 'email',
      reversible: true,
      sideEffects: true,
      params: {
        messageId: { type: 'string', description: 'Message ID', required: true },
      },
    },
    // --- Drive ---
    {
      id: 'drive-list-files',
      name: 'List Drive Files',
      description: 'List files in Google Drive',
      trustMinimum: 1,
      trustDomain: 'files',
      reversible: false,
      sideEffects: false,
      params: {
        folderId: { type: 'string', description: 'Folder ID (default: root)' },
        maxResults: { type: 'number', description: 'Max files to return', default: 20 },
        query: { type: 'string', description: 'Drive search query' },
      },
    },
    {
      id: 'drive-read-file',
      name: 'Read Drive File',
      description: 'Read a file from Google Drive',
      trustMinimum: 1,
      trustDomain: 'files',
      reversible: false,
      sideEffects: false,
      params: {
        fileId: { type: 'string', description: 'File ID', required: true },
      },
    },
    {
      id: 'drive-create-file',
      name: 'Create Drive File',
      description: 'Create a new file in Google Drive',
      trustMinimum: 2,
      trustDomain: 'files',
      reversible: true,
      sideEffects: true,
      params: {
        name: { type: 'string', description: 'File name', required: true },
        content: { type: 'string', description: 'File content', required: true },
        mimeType: { type: 'string', description: 'MIME type', default: 'text/plain' },
        folderId: { type: 'string', description: 'Parent folder ID' },
      },
    },
    {
      id: 'drive-upload',
      name: 'Upload to Drive',
      description: 'Upload a file to Google Drive',
      trustMinimum: 2,
      trustDomain: 'files',
      reversible: true,
      sideEffects: true,
      params: {
        name: { type: 'string', description: 'File name', required: true },
        content: { type: 'string', description: 'Base64-encoded content', required: true },
        mimeType: { type: 'string', description: 'MIME type', required: true },
        folderId: { type: 'string', description: 'Parent folder ID' },
      },
    },
    {
      id: 'drive-search',
      name: 'Search Drive',
      description: 'Search files in Google Drive',
      trustMinimum: 1,
      trustDomain: 'files',
      reversible: false,
      sideEffects: false,
      params: {
        query: { type: 'string', description: 'Search query', required: true },
        maxResults: { type: 'number', description: 'Max results', default: 10 },
      },
    },
    {
      id: 'drive-share',
      name: 'Share Drive File',
      description: 'Share a Google Drive file with someone',
      trustMinimum: 3,
      trustDomain: 'files',
      reversible: true,
      sideEffects: true,
      params: {
        fileId: { type: 'string', description: 'File ID', required: true },
        email: { type: 'string', description: 'Email to share with', required: true },
        role: { type: 'string', description: 'Permission role (reader, writer, commenter)', default: 'reader' },
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
      id: 'file-shared',
      name: 'File Shared',
      description: 'Triggered when a file is shared with you',
      type: 'poll',
      pollIntervalMs: 300_000,
    },
  ],

  entities: [
    {
      id: 'calendar-event',
      name: 'Calendar Event',
      description: 'A Google Calendar event',
      fields: { id: 'string', summary: 'string', start: 'string', end: 'string', attendees: 'array' },
    },
    {
      id: 'email-message',
      name: 'Email Message',
      description: 'A Gmail message',
      fields: { id: 'string', from: 'string', to: 'string', subject: 'string', body: 'string', date: 'string' },
    },
    {
      id: 'drive-file',
      name: 'Drive File',
      description: 'A Google Drive file',
      fields: { id: 'string', name: 'string', mimeType: 'string', size: 'number', modifiedTime: 'string' },
    },
  ],

  async executeAction(actionId: string, params: Record<string, unknown>, token: string): Promise<unknown> {
    const client = createGoogleClient(token);

    switch (actionId) {
      // --- Calendar ---
      case 'calendar-list-events': {
        const res = await client.calendar.events.list({
          calendarId: (params.calendarId as string) ?? 'primary',
          maxResults: (params.maxResults as number) ?? 10,
          timeMin: (params.timeMin as string) ?? new Date().toISOString(),
          timeMax: params.timeMax as string | undefined,
          singleEvents: true,
          orderBy: 'startTime',
        });
        return { events: res.data.items ?? [] };
      }

      case 'calendar-create-event': {
        const attendees = params.attendees
          ? (params.attendees as string[]).map(email => ({ email }))
          : undefined;
        const res = await client.calendar.events.insert({
          calendarId: (params.calendarId as string) ?? 'primary',
          requestBody: {
            summary: params.summary as string,
            description: params.description as string | undefined,
            start: { dateTime: params.start as string },
            end: { dateTime: params.end as string },
            attendees,
          },
        });
        return { eventId: res.data.id, status: 'created', summary: res.data.summary };
      }

      case 'calendar-update-event': {
        const requestBody: Record<string, unknown> = {};
        if (params.summary) requestBody.summary = params.summary;
        if (params.start) requestBody.start = { dateTime: params.start as string };
        if (params.end) requestBody.end = { dateTime: params.end as string };
        const res = await client.calendar.events.patch({
          calendarId: (params.calendarId as string) ?? 'primary',
          eventId: params.eventId as string,
          requestBody,
        });
        return { eventId: res.data.id, status: 'updated' };
      }

      case 'calendar-delete-event': {
        await client.calendar.events.delete({
          calendarId: (params.calendarId as string) ?? 'primary',
          eventId: params.eventId as string,
        });
        return { eventId: params.eventId, status: 'deleted' };
      }

      case 'calendar-find-free-slots': {
        const calendarIds = (params.calendarIds as string[] | undefined) ?? ['primary'];
        const res = await client.calendar.freebusy.query({
          requestBody: {
            timeMin: params.timeMin as string,
            timeMax: params.timeMax as string,
            items: calendarIds.map(id => ({ id })),
          },
        });
        const durationMs = ((params.durationMinutes as number) ?? 30) * 60_000;
        const busySlots = Object.values(res.data.calendars ?? {}).flatMap(
          cal => (cal as { busy?: Array<{ start?: string; end?: string }> }).busy ?? [],
        );
        busySlots.sort((a, b) => new Date(a.start!).getTime() - new Date(b.start!).getTime());

        const windowStart = new Date(params.timeMin as string).getTime();
        const windowEnd = new Date(params.timeMax as string).getTime();
        const slots: Array<{ start: string; end: string }> = [];
        let cursor = windowStart;

        for (const busy of busySlots) {
          const busyStart = new Date(busy.start!).getTime();
          if (busyStart - cursor >= durationMs) {
            slots.push({ start: new Date(cursor).toISOString(), end: new Date(busyStart).toISOString() });
          }
          cursor = Math.max(cursor, new Date(busy.end!).getTime());
        }
        if (windowEnd - cursor >= durationMs) {
          slots.push({ start: new Date(cursor).toISOString(), end: new Date(windowEnd).toISOString() });
        }

        return { slots };
      }

      // --- Gmail ---
      case 'gmail-list-messages': {
        const res = await client.gmail.users.messages.list({
          userId: 'me',
          maxResults: (params.maxResults as number) ?? 10,
          q: params.query as string | undefined,
          labelIds: params.labelIds as string[] | undefined,
        });
        return { messages: res.data.messages ?? [] };
      }

      case 'gmail-read-message': {
        const res = await client.gmail.users.messages.get({
          userId: 'me',
          id: params.messageId as string,
          format: 'full',
        });
        const headers = res.data.payload?.headers ?? [];
        const subject = headers.find(h => h.name === 'Subject')?.value ?? '';
        const from = headers.find(h => h.name === 'From')?.value ?? '';
        const to = headers.find(h => h.name === 'To')?.value ?? '';
        const date = headers.find(h => h.name === 'Date')?.value ?? '';
        const body = extractBody(res.data.payload);
        return { messageId: res.data.id, subject, from, to, date, body, snippet: res.data.snippet };
      }

      case 'gmail-send': {
        const lines = [
          `To: ${params.to as string}`,
          ...(params.cc ? [`Cc: ${params.cc as string}`] : []),
          ...(params.bcc ? [`Bcc: ${params.bcc as string}`] : []),
          `Subject: ${params.subject as string}`,
          'Content-Type: text/plain; charset="UTF-8"',
          '',
          params.body as string,
        ];
        const raw = Buffer.from(lines.join('\r\n')).toString('base64url');
        const res = await client.gmail.users.messages.send({
          userId: 'me',
          requestBody: { raw },
        });
        return { messageId: res.data.id, status: 'sent' };
      }

      case 'gmail-draft': {
        const draftLines = [
          `To: ${params.to as string}`,
          `Subject: ${params.subject as string}`,
          'Content-Type: text/plain; charset="UTF-8"',
          '',
          params.body as string,
        ];
        const draftRaw = Buffer.from(draftLines.join('\r\n')).toString('base64url');
        const res = await client.gmail.users.drafts.create({
          userId: 'me',
          requestBody: { message: { raw: draftRaw } },
        });
        return { draftId: res.data.id, status: 'created' };
      }

      case 'gmail-search': {
        const res = await client.gmail.users.messages.list({
          userId: 'me',
          q: params.query as string,
          maxResults: (params.maxResults as number) ?? 10,
        });
        return { messages: res.data.messages ?? [], query: params.query };
      }

      case 'gmail-archive': {
        await client.gmail.users.messages.modify({
          userId: 'me',
          id: params.messageId as string,
          requestBody: { removeLabelIds: ['INBOX'] },
        });
        return { messageId: params.messageId, status: 'archived' };
      }

      // --- Drive ---
      case 'drive-list-files': {
        const queryParts: string[] = [];
        if (params.folderId) queryParts.push(`'${params.folderId as string}' in parents`);
        if (params.query) queryParts.push(`name contains '${params.query as string}'`);
        const res = await client.drive.files.list({
          pageSize: (params.maxResults as number) ?? 20,
          q: queryParts.length > 0 ? queryParts.join(' and ') : undefined,
          fields: 'files(id,name,mimeType,size,modifiedTime)',
        });
        return { files: res.data.files ?? [] };
      }

      case 'drive-read-file': {
        const meta = await client.drive.files.get({
          fileId: params.fileId as string,
          fields: 'id,name,mimeType,size',
        });
        const res = await client.drive.files.get(
          { fileId: params.fileId as string, alt: 'media' },
          { responseType: 'stream' },
        );
        const chunks: Buffer[] = [];
        for await (const chunk of res.data as Readable) {
          chunks.push(Buffer.from(chunk as Uint8Array));
        }
        const content = Buffer.concat(chunks).toString('utf-8');
        return { fileId: meta.data.id, name: meta.data.name, mimeType: meta.data.mimeType, content };
      }

      case 'drive-create-file': {
        const fileContent = params.content as string;
        const res = await client.drive.files.create({
          requestBody: {
            name: params.name as string,
            mimeType: (params.mimeType as string) ?? 'text/plain',
            parents: params.folderId ? [params.folderId as string] : undefined,
          },
          media: {
            mimeType: (params.mimeType as string) ?? 'text/plain',
            body: Readable.from([fileContent]),
          },
          fields: 'id,name',
        });
        return { fileId: res.data.id, name: res.data.name, status: 'created' };
      }

      case 'drive-upload': {
        const uploadBuffer = Buffer.from(params.content as string, 'base64');
        const res = await client.drive.files.create({
          requestBody: {
            name: params.name as string,
            mimeType: params.mimeType as string,
            parents: params.folderId ? [params.folderId as string] : undefined,
          },
          media: {
            mimeType: params.mimeType as string,
            body: Readable.from([uploadBuffer]),
          },
          fields: 'id,name',
        });
        return { fileId: res.data.id, name: res.data.name, status: 'uploaded' };
      }

      case 'drive-search': {
        const res = await client.drive.files.list({
          q: `fullText contains '${params.query as string}'`,
          pageSize: (params.maxResults as number) ?? 10,
          fields: 'files(id,name,mimeType,size,modifiedTime)',
        });
        return { files: res.data.files ?? [], query: params.query };
      }

      case 'drive-share': {
        await client.drive.permissions.create({
          fileId: params.fileId as string,
          requestBody: {
            type: 'user',
            role: (params.role as string) ?? 'reader',
            emailAddress: params.email as string,
          },
        });
        return { fileId: params.fileId, sharedWith: params.email, status: 'shared' };
      }

      default:
        throw new Error(`Unknown action: ${actionId}`);
    }
  },

  async pollTrigger(triggerId: string, token: string, lastPollAt?: number): Promise<TriggerEvent[]> {
    const client = createGoogleClient(token);

    switch (triggerId) {
      case 'new-email': {
        const after = Math.floor((lastPollAt ?? Date.now() - 120_000) / 1000);
        const res = await client.gmail.users.messages.list({
          userId: 'me',
          q: `after:${after}`,
          maxResults: 20,
        });
        return (res.data.messages ?? []).map(m => ({
          triggerId: 'new-email',
          connectorId: 'google-workspace',
          timestamp: Date.now(),
          data: { messageId: m.id },
        }));
      }

      case 'event-starting-soon': {
        const now = new Date();
        const soon = new Date(now.getTime() + 15 * 60_000);
        const res = await client.calendar.events.list({
          calendarId: 'primary',
          timeMin: now.toISOString(),
          timeMax: soon.toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
        });
        return (res.data.items ?? []).map(e => ({
          triggerId: 'event-starting-soon',
          connectorId: 'google-workspace',
          timestamp: Date.now(),
          data: { eventId: e.id, summary: e.summary, start: e.start },
        }));
      }

      case 'file-shared': {
        const after = lastPollAt
          ? new Date(lastPollAt).toISOString()
          : new Date(Date.now() - 300_000).toISOString();
        const res = await client.drive.files.list({
          q: `sharedWithMe = true and modifiedTime > '${after}'`,
          pageSize: 20,
          fields: 'files(id,name,mimeType,modifiedTime,sharingUser)',
        });
        return (res.data.files ?? []).map(f => ({
          triggerId: 'file-shared',
          connectorId: 'google-workspace',
          timestamp: Date.now(),
          data: { fileId: f.id, name: f.name, mimeType: f.mimeType },
        }));
      }

      default:
        return [];
    }
  },
});
