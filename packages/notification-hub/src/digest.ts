import type { Notification, NotificationPriority } from './types.js';

const PRIORITY_ORDER: Record<NotificationPriority, number> = {
  urgent: 0,
  important: 1,
  low: 2,
  muted: 3,
};

export class DigestGenerator {
  generate(notifications: Notification[]): string {
    if (notifications.length === 0) {
      return '# Notification Digest\n\nNo notifications.\n';
    }

    const grouped = new Map<string, Notification[]>();
    for (const n of notifications) {
      const group = grouped.get(n.source) ?? [];
      group.push(n);
      grouped.set(n.source, group);
    }

    const lines: string[] = [];
    lines.push(`# Notification Digest`);
    lines.push(`\n**${notifications.length} notification(s)**\n`);

    for (const [source, items] of grouped) {
      items.sort((a, b) => {
        const pDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        if (pDiff !== 0) return pDiff;
        return a.timestamp - b.timestamp;
      });

      lines.push(`## ${source}`);
      for (const n of items) {
        lines.push(`- [${n.priority}] ${n.title}: ${n.body}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  generateCompact(notifications: Notification[]): string {
    return notifications
      .map((n) => `[${n.source}/${n.priority}] ${n.title}: ${n.body}`)
      .join('\n');
  }
}
