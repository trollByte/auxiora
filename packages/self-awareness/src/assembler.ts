import type {
  SignalCollector,
  CollectionContext,
  PostResponseContext,
  AwarenessSignal,
} from './types.js';

export interface AssemblerOptions {
  /** Max approximate tokens for the output. Default 500. */
  tokenBudget?: number;
  /** Max ms per collector before timeout. Default 200. */
  collectorTimeoutMs?: number;
}

export class SelfAwarenessAssembler {
  private readonly collectors: SignalCollector[];
  private readonly tokenBudget: number;
  private readonly collectorTimeoutMs: number;

  constructor(collectors: SignalCollector[], options?: AssemblerOptions) {
    this.collectors = collectors;
    this.tokenBudget = options?.tokenBudget ?? 500;
    this.collectorTimeoutMs = options?.collectorTimeoutMs ?? 200;
  }

  async assemble(context: CollectionContext): Promise<string> {
    const enabled = this.collectors.filter(c => c.enabled);
    if (enabled.length === 0) return '';

    const results = await Promise.allSettled(
      enabled.map(c =>
        Promise.race([
          c.collect(context),
          new Promise<AwarenessSignal[]>(resolve =>
            setTimeout(() => resolve([]), this.collectorTimeoutMs),
          ),
        ]),
      ),
    );

    const signals: AwarenessSignal[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') signals.push(...r.value);
    }

    if (signals.length === 0) return '';

    signals.sort((a, b) => b.priority - a.priority);

    return this.compress(signals);
  }

  async afterResponse(context: PostResponseContext): Promise<void> {
    await Promise.allSettled(
      this.collectors
        .filter(c => c.enabled && c.afterResponse)
        .map(c => c.afterResponse!(context)),
    );
  }

  private compress(signals: AwarenessSignal[]): string {
    const charBudget = this.tokenBudget * 4;
    const lines: string[] = [];
    let used = 0;

    for (const signal of signals) {
      const lineLen = signal.text.length + 1;
      if (used + lineLen > charBudget) continue;
      lines.push(signal.text);
      used += lineLen;
    }

    return lines.join('\n');
  }
}
