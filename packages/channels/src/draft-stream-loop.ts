/**
 * Channel-agnostic throttled send/edit loop for draft streaming.
 *
 * Sends the first chunk immediately, then throttles subsequent updates.
 * Only one API call is in-flight at a time. Latest text wins (coalescing).
 */

export class DraftStreamLoop {
  private pendingText: string | null = null;
  private inFlightPromise: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastSentAt = 0;
  private readonly throttleMs: number;

  constructor(
    private readonly sendOrEdit: (text: string) => Promise<boolean>,
    overrides?: { coalescingIdleMs?: number; typingDelayMs?: number } | number,
  ) {
    this.throttleMs = typeof overrides === 'number'
      ? overrides
      : overrides?.coalescingIdleMs ?? 1000;
  }

  /** Set the latest full text to display. Schedules or triggers a flush. */
  update(text: string): void {
    this.pendingText = text;
    this.scheduleFlush();
  }

  /** Force delivery of pending text. Waits for in-flight, then fires pending. */
  async flush(): Promise<void> {
    this.clearTimer();

    if (this.inFlightPromise) {
      await this.inFlightPromise;
    }

    if (this.pendingText !== null) {
      void this.doSend();
    }
  }

  /** Cancel timer and clear pending text. */
  stop(): void {
    this.clearTimer();
    this.pendingText = null;
  }

  private scheduleFlush(): void {
    if (this.inFlightPromise || this.timer) return;

    const elapsed = Date.now() - this.lastSentAt;
    const delay = Math.max(0, this.throttleMs - elapsed);

    this.timer = setTimeout(() => {
      this.timer = null;
      void this.doSend();
    }, delay);
  }

  private doSend(): Promise<void> {
    const text = this.pendingText;
    if (text === null) return Promise.resolve();
    this.pendingText = null;

    const p = this.sendOrEdit(text).then(
      (ok) => {
        if (!ok && this.pendingText === null) {
          this.pendingText = text;
        }
      },
      () => {
        // Swallow errors
      },
    ).then(() => {
      if (this.inFlightPromise === p) {
        this.inFlightPromise = null;
        this.lastSentAt = Date.now();
        if (this.pendingText !== null) {
          this.scheduleFlush();
        }
      }
    });

    this.inFlightPromise = p;
    return p;
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
