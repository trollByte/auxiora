import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/plugin-autostart', () => ({
  isEnabled: vi.fn(),
  enable: vi.fn(),
  disable: vi.fn(),
}));

import { getAutoStartEnabled, setAutoStartEnabled } from '../src/settings.js';
import { isEnabled, enable, disable } from '@tauri-apps/plugin-autostart';

const mockIsEnabled = vi.mocked(isEnabled);
const mockEnable = vi.mocked(enable);
const mockDisable = vi.mocked(disable);

beforeEach(() => {
  mockIsEnabled.mockReset();
  mockEnable.mockReset();
  mockDisable.mockReset();
});

describe('getAutoStartEnabled', () => {
  it('returns true when auto-start is enabled', async () => {
    mockIsEnabled.mockResolvedValue(true);
    expect(await getAutoStartEnabled()).toBe(true);
  });

  it('returns false when auto-start is disabled', async () => {
    mockIsEnabled.mockResolvedValue(false);
    expect(await getAutoStartEnabled()).toBe(false);
  });
});

describe('setAutoStartEnabled', () => {
  it('calls enable() when true', async () => {
    mockEnable.mockResolvedValue(undefined);
    await setAutoStartEnabled(true);
    expect(mockEnable).toHaveBeenCalled();
    expect(mockDisable).not.toHaveBeenCalled();
  });

  it('calls disable() when false', async () => {
    mockDisable.mockResolvedValue(undefined);
    await setAutoStartEnabled(false);
    expect(mockDisable).toHaveBeenCalled();
    expect(mockEnable).not.toHaveBeenCalled();
  });
});
