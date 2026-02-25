/**
 * Performance monitoring and metrics for Auxiora
 *
 * Features:
 * - Counters (incrementing values)
 * - Gauges (current values)
 * - Histograms (timing/duration tracking)
 * - Prometheus export format
 * - Low overhead
 */

export interface MetricLabels {
  [key: string]: string | number;
}

export interface MetricOptions {
  name: string;
  help: string;
  labels?: string[];
}

/**
 * Counter metric (only increases)
 */
export class Counter {
  private value = 0;
  private labeledValues = new Map<string, number>();

  constructor(
    private name: string,
    private help: string,
    private labelNames: string[] = []
  ) {}

  inc(labels?: MetricLabels, value = 1): void {
    if (!labels || this.labelNames.length === 0) {
      this.value += value;
    } else {
      const key = this.getLabelKey(labels);
      this.labeledValues.set(key, (this.labeledValues.get(key) || 0) + value);
    }
  }

  get(): number {
    return this.value;
  }

  getWithLabels(labels: MetricLabels): number {
    const key = this.getLabelKey(labels);
    return this.labeledValues.get(key) || 0;
  }

  toPrometheus(): string {
    const lines: string[] = [];
    lines.push(`# HELP ${this.name} ${this.help}`);
    lines.push(`# TYPE ${this.name} counter`);

    if (this.labelNames.length === 0) {
      lines.push(`${this.name} ${this.value}`);
    } else {
      for (const [labels, value] of this.labeledValues.entries()) {
        lines.push(`${this.name}{${labels}} ${value}`);
      }
    }

    return lines.join('\n');
  }

  private getLabelKey(labels: MetricLabels): string {
    return this.labelNames
      .map((name) => `${name}="${labels[name]}"`)
      .join(',');
  }
}

/**
 * Gauge metric (can increase or decrease)
 */
export class Gauge {
  private value = 0;
  private labeledValues = new Map<string, number>();

  constructor(
    private name: string,
    private help: string,
    private labelNames: string[] = []
  ) {}

  set(value: number, labels?: MetricLabels): void {
    if (!labels || this.labelNames.length === 0) {
      this.value = value;
    } else {
      const key = this.getLabelKey(labels);
      this.labeledValues.set(key, value);
    }
  }

  inc(labels?: MetricLabels, value = 1): void {
    if (!labels || this.labelNames.length === 0) {
      this.value += value;
    } else {
      const key = this.getLabelKey(labels);
      this.labeledValues.set(key, (this.labeledValues.get(key) || 0) + value);
    }
  }

  dec(labels?: MetricLabels, value = 1): void {
    this.inc(labels, -value);
  }

  get(): number {
    return this.value;
  }

  getWithLabels(labels: MetricLabels): number {
    const key = this.getLabelKey(labels);
    return this.labeledValues.get(key) || 0;
  }

  toPrometheus(): string {
    const lines: string[] = [];
    lines.push(`# HELP ${this.name} ${this.help}`);
    lines.push(`# TYPE ${this.name} gauge`);

    if (this.labelNames.length === 0) {
      lines.push(`${this.name} ${this.value}`);
    } else {
      for (const [labels, value] of this.labeledValues.entries()) {
        lines.push(`${this.name}{${labels}} ${value}`);
      }
    }

    return lines.join('\n');
  }

  private getLabelKey(labels: MetricLabels): string {
    return this.labelNames
      .map((name) => `${name}="${labels[name]}"`)
      .join(',');
  }
}

/**
 * Histogram metric (tracks distribution of values)
 */
export class Histogram {
  private buckets: number[];
  private counts = new Map<number, number>();
  private sum = 0;
  private count = 0;
  private labeledData = new Map<string, {
    counts: Map<number, number>;
    sum: number;
    count: number;
  }>();

  constructor(
    private name: string,
    private help: string,
    private labelNames: string[] = [],
    buckets?: number[]
  ) {
    // Default buckets for latency: 10ms, 50ms, 100ms, 500ms, 1s, 5s, 10s, 30s
    this.buckets = buckets || [0.01, 0.05, 0.1, 0.5, 1, 5, 10, 30];

    // Initialize bucket counts
    for (const bucket of this.buckets) {
      this.counts.set(bucket, 0);
    }
    this.counts.set(Infinity, 0); // +Inf bucket
  }

  observe(value: number, labels?: MetricLabels): void {
    if (!labels || this.labelNames.length === 0) {
      this.sum += value;
      this.count++;

      // Increment bucket counts
      for (const bucket of [...this.buckets, Infinity]) {
        if (value <= bucket) {
          this.counts.set(bucket, (this.counts.get(bucket) || 0) + 1);
        }
      }
    } else {
      const key = this.getLabelKey(labels);
      let data = this.labeledData.get(key);

      if (!data) {
        const counts = new Map<number, number>();
        for (const bucket of [...this.buckets, Infinity]) {
          counts.set(bucket, 0);
        }
        data = { counts, sum: 0, count: 0 };
        this.labeledData.set(key, data);
      }

      data.sum += value;
      data.count++;

      for (const bucket of [...this.buckets, Infinity]) {
        if (value <= bucket) {
          data.counts.set(bucket, (data.counts.get(bucket) || 0) + 1);
        }
      }
    }
  }

  /**
   * Time an async function and record duration
   */
  async time<T>(fn: () => Promise<T>, labels?: MetricLabels): Promise<T> {
    const start = performance.now();
    try {
      return await fn();
    } finally {
      const duration = (performance.now() - start) / 1000; // Convert to seconds
      this.observe(duration, labels);
    }
  }

  getStats(): { count: number; sum: number; avg: number } {
    return {
      count: this.count,
      sum: this.sum,
      avg: this.count > 0 ? this.sum / this.count : 0,
    };
  }

  toPrometheus(): string {
    const lines: string[] = [];
    lines.push(`# HELP ${this.name} ${this.help}`);
    lines.push(`# TYPE ${this.name} histogram`);

    if (this.labelNames.length === 0) {
      // Output buckets
      for (const [bucket, count] of this.counts.entries()) {
        const le = bucket === Infinity ? '+Inf' : bucket.toString();
        lines.push(`${this.name}_bucket{le="${le}"} ${count}`);
      }
      lines.push(`${this.name}_sum ${this.sum}`);
      lines.push(`${this.name}_count ${this.count}`);
    } else {
      for (const [labelKey, data] of this.labeledData.entries()) {
        for (const [bucket, count] of data.counts.entries()) {
          const le = bucket === Infinity ? '+Inf' : bucket.toString();
          lines.push(`${this.name}_bucket{${labelKey},le="${le}"} ${count}`);
        }
        lines.push(`${this.name}_sum{${labelKey}} ${data.sum}`);
        lines.push(`${this.name}_count{${labelKey}} ${data.count}`);
      }
    }

    return lines.join('\n');
  }

  private getLabelKey(labels: MetricLabels): string {
    return this.labelNames
      .map((name) => `${name}="${labels[name]}"`)
      .join(',');
  }
}

/**
 * Metrics registry
 */
export class MetricsRegistry {
  private metrics = new Map<string, Counter | Gauge | Histogram>();

  counter(name: string, help: string, labels?: string[]): Counter {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, new Counter(name, help, labels));
    }
    return this.metrics.get(name) as Counter;
  }

  gauge(name: string, help: string, labels?: string[]): Gauge {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, new Gauge(name, help, labels));
    }
    return this.metrics.get(name) as Gauge;
  }

  histogram(name: string, help: string, labels?: string[], buckets?: number[]): Histogram {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, new Histogram(name, help, labels, buckets));
    }
    return this.metrics.get(name) as Histogram;
  }

  /**
   * Export all metrics in Prometheus format
   */
  toPrometheus(): string {
    const lines: string[] = [];

    for (const metric of this.metrics.values()) {
      lines.push(metric.toPrometheus());
      lines.push(''); // Blank line between metrics
    }

    return lines.join('\n');
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics.clear();
  }
}

/**
 * Global metrics registry
 */
export const metrics = new MetricsRegistry();

/**
 * Pre-defined application metrics
 */
export const applicationMetrics = {
  // Request metrics
  httpRequestsTotal: metrics.counter(
    'auxiora_http_requests_total',
    'Total HTTP requests',
    ['method', 'status', 'path']
  ),

  httpRequestDuration: metrics.histogram(
    'auxiora_http_request_duration_seconds',
    'HTTP request duration in seconds',
    ['method', 'path']
  ),

  // Provider metrics
  providerRequestsTotal: metrics.counter(
    'auxiora_provider_requests_total',
    'Total AI provider requests',
    ['provider', 'model', 'status']
  ),

  providerRequestDuration: metrics.histogram(
    'auxiora_provider_request_duration_seconds',
    'AI provider request duration in seconds',
    ['provider', 'model']
  ),

  providerTokensUsed: metrics.counter(
    'auxiora_provider_tokens_used_total',
    'Total tokens used',
    ['provider', 'type'] // type: input | output
  ),

  // Session metrics
  sessionsActive: metrics.gauge(
    'auxiora_sessions_active',
    'Number of active sessions'
  ),

  sessionsTotal: metrics.counter(
    'auxiora_sessions_total',
    'Total sessions created',
    ['channel']
  ),

  // Channel metrics
  channelMessagesReceived: metrics.counter(
    'auxiora_channel_messages_received_total',
    'Total messages received from channels',
    ['channel']
  ),

  channelMessagesSent: metrics.counter(
    'auxiora_channel_messages_sent_total',
    'Total messages sent to channels',
    ['channel', 'status']
  ),

  // Error metrics
  errorsTotal: metrics.counter(
    'auxiora_errors_total',
    'Total errors',
    ['type', 'code']
  ),

  // Vault metrics
  vaultOperations: metrics.counter(
    'auxiora_vault_operations_total',
    'Total vault operations',
    ['operation', 'status'] // operation: get | add | remove
  ),
};
