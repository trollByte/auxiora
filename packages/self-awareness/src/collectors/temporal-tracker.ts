import type {
  SignalCollector, CollectionContext, PostResponseContext, AwarenessSignal, AwarenessStorage,
} from '../types.js';

interface DayCounter { date: string; messages: number; corrections: number; }
interface TemporalState { days: DayCounter[]; }

function formatDuration(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 && d === 0) parts.push(`${m}m`);
  return parts.join(' ') || '<1m';
}

export class TemporalTracker implements SignalCollector {
  readonly name = 'temporal-tracker';
  enabled = true;

  constructor(private storage: AwarenessStorage) {}

  async collect(context: CollectionContext): Promise<AwarenessSignal[]> {
    const uptime = process.uptime();
    const parts: string[] = [`Running for ${formatDuration(uptime)}`];

    if (context.recentMessages.length > 0) {
      const first = context.recentMessages[0].timestamp;
      const durationMin = Math.round((Date.now() - first) / 60_000);
      parts.push(`This conversation: ${context.recentMessages.length} messages over ${durationMin}min`);
    }

    const state = await this.storage.read('temporal', 'daily-counters') as TemporalState | null;
    if (state?.days && state.days.length >= 3) {
      const recent = state.days.slice(-7);
      const totalMsgs = recent.reduce((s, d) => s + d.messages, 0);
      const totalCorr = recent.reduce((s, d) => s + d.corrections, 0);
      const corrRate = totalMsgs > 0 ? (totalCorr / totalMsgs * 100).toFixed(1) : '0';
      parts.push(`Correction rate this week: ${corrRate}%`);
    }

    return [{
      dimension: this.name,
      priority: 0.4,
      text: `Timeline: ${parts.join('. ')}.`,
      data: { uptimeSeconds: uptime, messageCount: context.recentMessages.length },
    }];
  }

  async afterResponse(context: PostResponseContext): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    const state = await this.storage.read('temporal', 'daily-counters') as TemporalState | null;
    const days = state?.days ?? [];

    let todayEntry = days.find(d => d.date === today);
    if (!todayEntry) {
      todayEntry = { date: today, messages: 0, corrections: 0 };
      days.push(todayEntry);
    }
    todayEntry.messages++;

    const msgLower = context.currentMessage.toLowerCase();
    if (['actually,', "that's wrong", "that's not right", "you're wrong"].some(p => msgLower.includes(p))) {
      todayEntry.corrections++;
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const pruned = days.filter(d => d.date >= cutoffStr);

    await this.storage.write('temporal', 'daily-counters', { days: pruned });
  }
}
