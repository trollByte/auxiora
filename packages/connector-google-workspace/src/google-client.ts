import { google } from 'googleapis';

export function createGoogleClient(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return {
    calendar: google.calendar({ version: 'v3', auth }),
    gmail: google.gmail({ version: 'v1', auth }),
    drive: google.drive({ version: 'v3', auth }),
  };
}

export type GoogleClient = ReturnType<typeof createGoogleClient>;
