import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkGateway, GatewayMonitor } from '../src/health.js';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('checkGateway', () => {
  it('returns true when fetch returns ok', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    expect(await checkGateway()).toBe(true);
  });

  it('returns false when fetch throws', async () => {
    mockFetch.mockRejectedValue(new Error('network error'));
    expect(await checkGateway()).toBe(false);
  });

  it('returns false when response is not ok', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    expect(await checkGateway()).toBe(false);
  });

  it('uses custom URL when provided', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    await checkGateway('http://example.com/health');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://example.com/health',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('uses default URL when none provided', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    await checkGateway();
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:18800/api/v1/health',
      expect.any(Object),
    );
  });
});

/** Helper: flush microtask queue so awaited promises inside the monitor settle. */
async function flushMicrotasks(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

describe('GatewayMonitor', () => {
  it('initial status is checking', () => {
    const monitor = new GatewayMonitor();
    expect(monitor.getStatus()).toBe('checking');
  });

  it('starts polling and updates status to connected', async () => {
    vi.useFakeTimers();
    mockFetch.mockResolvedValue({ ok: true });

    const onChange = vi.fn();
    const monitor = new GatewayMonitor({ onStatusChange: onChange });
    monitor.start();

    // Flush the initial check's microtask
    await flushMicrotasks();

    expect(monitor.getStatus()).toBe('connected');
    expect(onChange).toHaveBeenCalledWith('connected');

    monitor.stop();
  });

  it('updates status to disconnected when gateway is down', async () => {
    vi.useFakeTimers();
    mockFetch.mockResolvedValue({ ok: false });

    const onChange = vi.fn();
    const monitor = new GatewayMonitor({ onStatusChange: onChange });
    monitor.start();

    await flushMicrotasks();

    expect(monitor.getStatus()).toBe('disconnected');
    expect(onChange).toHaveBeenCalledWith('disconnected');

    monitor.stop();
  });

  it('stop() stops the interval', async () => {
    vi.useFakeTimers();
    mockFetch.mockResolvedValue({ ok: true });

    const onChange = vi.fn();
    const monitor = new GatewayMonitor({
      intervalMs: 1000,
      onStatusChange: onChange,
    });
    monitor.start();

    await flushMicrotasks();
    onChange.mockClear();
    mockFetch.mockClear();

    monitor.stop();

    // Change fetch behavior after stop
    mockFetch.mockResolvedValue({ ok: false });
    await vi.advanceTimersByTimeAsync(5000);

    // Should not have been called again after stop
    expect(mockFetch).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('calls onStatusChange when status changes', async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const monitor = new GatewayMonitor({
      intervalMs: 1000,
      onStatusChange: onChange,
    });

    // First check: connected
    mockFetch.mockResolvedValue({ ok: true });
    monitor.start();
    await flushMicrotasks();
    expect(onChange).toHaveBeenCalledWith('connected');
    onChange.mockClear();

    // Second check: disconnected (advance past interval)
    mockFetch.mockResolvedValue({ ok: false });
    await vi.advanceTimersByTimeAsync(1000);
    expect(onChange).toHaveBeenCalledWith('disconnected');

    monitor.stop();
  });

  it('does not call onStatusChange when status stays the same', async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const monitor = new GatewayMonitor({
      intervalMs: 1000,
      onStatusChange: onChange,
    });

    mockFetch.mockResolvedValue({ ok: true });
    monitor.start();
    await flushMicrotasks();
    expect(onChange).toHaveBeenCalledTimes(1);
    onChange.mockClear();

    // Next tick — still connected, should not fire
    await vi.advanceTimersByTimeAsync(1000);
    expect(onChange).not.toHaveBeenCalled();

    monitor.stop();
  });

  it('start() is idempotent — calling twice does not create duplicate intervals', async () => {
    vi.useFakeTimers();
    mockFetch.mockResolvedValue({ ok: true });

    const monitor = new GatewayMonitor({ intervalMs: 1000 });
    monitor.start();
    monitor.start();

    await flushMicrotasks();

    // Only initial check — one call from start(), second start() is no-op
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Advance one interval — should fire exactly once, not twice
    mockFetch.mockClear();
    await vi.advanceTimersByTimeAsync(1000);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    monitor.stop();
  });

  it('uses custom URL from options', async () => {
    vi.useFakeTimers();
    mockFetch.mockResolvedValue({ ok: true });

    const monitor = new GatewayMonitor({ url: 'http://custom:9999/health' });
    monitor.start();
    await flushMicrotasks();

    expect(mockFetch).toHaveBeenCalledWith(
      'http://custom:9999/health',
      expect.any(Object),
    );

    monitor.stop();
  });
});
