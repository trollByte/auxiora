import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/plugin-notification', () => ({
  isPermissionGranted: vi.fn(),
  requestPermission: vi.fn(),
  sendNotification: vi.fn(),
}));

import { notifyNewMessage, isNotificationEnabled } from '../src/notifications.js';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';

const mockIsGranted = vi.mocked(isPermissionGranted);
const mockRequest = vi.mocked(requestPermission);
const mockSend = vi.mocked(sendNotification);

beforeEach(() => {
  mockIsGranted.mockReset();
  mockRequest.mockReset();
  mockSend.mockReset();
});

describe('notifyNewMessage', () => {
  it('sends notification when permission already granted', async () => {
    mockIsGranted.mockResolvedValue(true);

    await notifyNewMessage('Hello', 'World');

    expect(mockRequest).not.toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledWith({ title: 'Hello', body: 'World' });
  });

  it('requests permission when not granted, then sends if approved', async () => {
    mockIsGranted.mockResolvedValue(false);
    mockRequest.mockResolvedValue('granted' as unknown as Awaited<ReturnType<typeof requestPermission>>);

    await notifyNewMessage('Title', 'Body');

    expect(mockRequest).toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledWith({ title: 'Title', body: 'Body' });
  });

  it('does NOT send when permission denied', async () => {
    mockIsGranted.mockResolvedValue(false);
    mockRequest.mockResolvedValue('denied' as unknown as Awaited<ReturnType<typeof requestPermission>>);

    await notifyNewMessage('Title', 'Body');

    expect(mockRequest).toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe('isNotificationEnabled', () => {
  it('returns true when permission is granted', async () => {
    mockIsGranted.mockResolvedValue(true);
    expect(await isNotificationEnabled()).toBe(true);
  });

  it('returns false when permission is not granted', async () => {
    mockIsGranted.mockResolvedValue(false);
    expect(await isNotificationEnabled()).toBe(false);
  });
});
