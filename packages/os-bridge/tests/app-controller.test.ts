import { describe, it, expect } from 'vitest';
import { AppController } from '../src/app-controller.js';

describe('AppController', () => {
  it('darwin launch command correct', () => {
    const ctrl = new AppController('darwin');
    expect(ctrl.getCommand('launch', 'Safari')).toBe('open -a "Safari"');
  });

  it('linux launch command correct', () => {
    const ctrl = new AppController('linux');
    expect(ctrl.getCommand('launch', 'firefox')).toBe('xdg-open "firefox" || firefox');
  });

  it('win32 launch command correct', () => {
    const ctrl = new AppController('win32');
    expect(ctrl.getCommand('launch', 'notepad')).toBe('start "" "notepad"');
  });

  it('darwin close command uses osascript', () => {
    const ctrl = new AppController('darwin');
    const cmd = ctrl.getCommand('close', 'Safari');
    expect(cmd).toContain('osascript');
    expect(cmd).toContain('quit');
  });

  it('linux close command uses pkill', () => {
    const ctrl = new AppController('linux');
    const cmd = ctrl.getCommand('close', 'firefox');
    expect(cmd).toContain('pkill');
  });

  it('win32 close command uses taskkill', () => {
    const ctrl = new AppController('win32');
    const cmd = ctrl.getCommand('close', 'notepad');
    expect(cmd).toContain('taskkill');
  });

  it('getCommand returns string for all actions', () => {
    const ctrl = new AppController('darwin');
    const actions = ['launch', 'focus', 'close', 'list'] as const;
    for (const action of actions) {
      const cmd = ctrl.getCommand(action, 'App');
      expect(typeof cmd).toBe('string');
      expect(cmd.length).toBeGreaterThan(0);
    }
  });

  it('launch returns command without executing', async () => {
    const ctrl = new AppController('linux');
    const result = await ctrl.launch('firefox');
    expect(result.success).toBe(true);
    expect(result.command).toBe('xdg-open "firefox" || firefox');
  });

  it('focus returns command without executing', async () => {
    const ctrl = new AppController('darwin');
    const result = await ctrl.focus('Safari');
    expect(result.success).toBe(true);
    expect(result.command).toContain('activate');
  });

  it('close returns command without executing', async () => {
    const ctrl = new AppController('win32');
    const result = await ctrl.close('notepad');
    expect(result.success).toBe(true);
    expect(result.command).toContain('taskkill');
  });
});
