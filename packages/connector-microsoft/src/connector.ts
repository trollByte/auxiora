import { defineConnector } from '@auxiora/connectors';
import type { TriggerEvent } from '@auxiora/connectors';

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
    // In production, these would make real API calls to Microsoft Graph API.
    // This is the connector skeleton with action routing.
    switch (actionId) {
      case 'mail-list-messages':
        return { messages: [], folderId: params.folderId ?? 'inbox' };
      case 'mail-read-message':
        return { messageId: params.messageId, subject: '', body: '' };
      case 'mail-send':
        return { messageId: `msg_${Date.now()}`, status: 'sent' };
      case 'mail-reply':
        return { messageId: params.messageId, status: 'replied' };
      case 'mail-forward':
        return { messageId: params.messageId, status: 'forwarded', to: params.to };
      case 'mail-move':
        return { messageId: params.messageId, status: 'moved', destinationFolderId: params.destinationFolderId };
      case 'mail-archive':
        return { messageId: params.messageId, status: 'archived' };
      case 'mail-flag':
        return { messageId: params.messageId, status: 'flagged' };
      case 'mail-search':
        return { messages: [], query: params.query };
      case 'mail-draft':
        return { draftId: `draft_${Date.now()}`, status: 'created' };
      case 'calendar-list-events':
        return { events: [], calendarId: params.calendarId ?? 'primary' };
      case 'calendar-create-event':
        return { eventId: `evt_${Date.now()}`, status: 'created', subject: params.subject };
      case 'calendar-update-event':
        return { eventId: params.eventId, status: 'updated' };
      case 'calendar-delete-event':
        return { eventId: params.eventId, status: 'deleted' };
      case 'calendar-find-availability':
        return { slots: [] };
      case 'contacts-list':
        return { contacts: [] };
      case 'contacts-get':
        return { contactId: params.contactId, displayName: '', emailAddresses: [] };
      case 'files-list':
        return { files: [] };
      case 'files-download':
        return { fileId: params.fileId, content: '' };
      case 'files-upload':
        return { fileId: `file_${Date.now()}`, status: 'uploaded', name: params.name };
      case 'files-search':
        return { files: [], query: params.query };
      default:
        throw new Error(`Unknown action: ${actionId}`);
    }
  },

  async pollTrigger(triggerId: string, _token: string, _lastPollAt?: number): Promise<TriggerEvent[]> {
    // In production, these would poll the real Microsoft Graph API.
    return [];
  },
});
