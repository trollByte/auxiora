import { defineConnector } from '@auxiora/connectors';
import type { TriggerEvent } from '@auxiora/connectors';

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
    // In production, these would make real API calls to Google APIs.
    // This is the connector skeleton with action routing.
    switch (actionId) {
      case 'calendar-list-events':
        return { events: [], calendarId: params.calendarId ?? 'primary' };
      case 'calendar-create-event':
        return { eventId: `evt_${Date.now()}`, status: 'created', summary: params.summary };
      case 'calendar-update-event':
        return { eventId: params.eventId, status: 'updated' };
      case 'calendar-delete-event':
        return { eventId: params.eventId, status: 'deleted' };
      case 'calendar-find-free-slots':
        return { slots: [] };
      case 'gmail-list-messages':
        return { messages: [] };
      case 'gmail-read-message':
        return { messageId: params.messageId, subject: '', body: '' };
      case 'gmail-send':
        return { messageId: `msg_${Date.now()}`, status: 'sent' };
      case 'gmail-draft':
        return { draftId: `draft_${Date.now()}`, status: 'created' };
      case 'gmail-search':
        return { messages: [], query: params.query };
      case 'gmail-archive':
        return { messageId: params.messageId, status: 'archived' };
      case 'drive-list-files':
        return { files: [] };
      case 'drive-read-file':
        return { fileId: params.fileId, content: '' };
      case 'drive-create-file':
        return { fileId: `file_${Date.now()}`, status: 'created' };
      case 'drive-upload':
        return { fileId: `file_${Date.now()}`, status: 'uploaded' };
      case 'drive-search':
        return { files: [], query: params.query };
      case 'drive-share':
        return { fileId: params.fileId, sharedWith: params.email, status: 'shared' };
      default:
        throw new Error(`Unknown action: ${actionId}`);
    }
  },

  async pollTrigger(triggerId: string, _token: string, _lastPollAt?: number): Promise<TriggerEvent[]> {
    // In production, these would poll the real Google APIs.
    return [];
  },
});
