import { describe, it, expect, vi } from 'vitest';
import { FileWatcher } from '../src/file-watcher.js';

describe('FileWatcher', () => {
  it('classifyFile: .pdf returns document', () => {
    const watcher = new FileWatcher({ directories: [] });
    expect(watcher.classifyFile('report.pdf')).toBe('document');
  });

  it('classifyFile: .jpg returns image', () => {
    const watcher = new FileWatcher({ directories: [] });
    expect(watcher.classifyFile('photo.jpg')).toBe('image');
  });

  it('classifyFile: .mp4 returns video', () => {
    const watcher = new FileWatcher({ directories: [] });
    expect(watcher.classifyFile('clip.mp4')).toBe('video');
  });

  it('classifyFile: .mp3 returns audio', () => {
    const watcher = new FileWatcher({ directories: [] });
    expect(watcher.classifyFile('song.mp3')).toBe('audio');
  });

  it('classifyFile: .ts returns code', () => {
    const watcher = new FileWatcher({ directories: [] });
    expect(watcher.classifyFile('index.ts')).toBe('code');
  });

  it('classifyFile: .zip returns archive', () => {
    const watcher = new FileWatcher({ directories: [] });
    expect(watcher.classifyFile('backup.zip')).toBe('archive');
  });

  it('classifyFile: .xlsx returns spreadsheet', () => {
    const watcher = new FileWatcher({ directories: [] });
    expect(watcher.classifyFile('data.xlsx')).toBe('spreadsheet');
  });

  it('classifyFile: .pptx returns presentation', () => {
    const watcher = new FileWatcher({ directories: [] });
    expect(watcher.classifyFile('slides.pptx')).toBe('presentation');
  });

  it('classifyFile: unknown ext returns other', () => {
    const watcher = new FileWatcher({ directories: [] });
    expect(watcher.classifyFile('data.xyz')).toBe('other');
  });

  it('suggestDestination returns correct dir', () => {
    const watcher = new FileWatcher({ directories: [] });
    const result = watcher.suggestDestination('photo.png');
    expect(result.classification).toBe('image');
    expect(result.suggestedDir).toBe('~/Documents/images/');
  });

  it('suggestDestination uses custom baseDir', () => {
    const watcher = new FileWatcher({ directories: [] });
    const result = watcher.suggestDestination('report.pdf', '/home/user');
    expect(result.suggestedDir).toBe('/home/user/documents/');
  });

  it('emitEvent notifies listener', () => {
    const watcher = new FileWatcher({ directories: ['/tmp'] });
    const listener = vi.fn();
    watcher.onEvent(listener);
    const event = { type: 'created' as const, path: '/tmp/test.txt', filename: 'test.txt', timestamp: Date.now() };
    watcher.emitEvent(event);
    expect(listener).toHaveBeenCalledWith(event);
  });

  it('onEvent unsubscribe stops notifications', () => {
    const watcher = new FileWatcher({ directories: [] });
    const listener = vi.fn();
    const unsub = watcher.onEvent(listener);
    unsub();
    watcher.emitEvent({ type: 'created', path: '/tmp/a.txt', filename: 'a.txt', timestamp: Date.now() });
    expect(listener).not.toHaveBeenCalled();
  });
});
