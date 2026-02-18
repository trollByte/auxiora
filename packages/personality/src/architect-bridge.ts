import type { ArchitectAwarenessCollector, ArchitectSnapshot } from './architect-awareness-collector.js';

export interface ArchitectLike {
  getConversationSummary(): { theme: string | null; messageCount: number };
}

export interface VaultLike {
  get(key: string): string | undefined;
  add(key: string, value: string): Promise<void>;
  has(key: string): boolean;
}

export interface BridgeOptions {
  onEscalation?: (alert: string, context: ArchitectSnapshot['detectedContext']) => void;
}

/**
 * Orchestrates Architect side effects: conversation state persistence,
 * awareness collector feeding, and escalation alert callbacks.
 *
 * The runtime calls `architect.generatePrompt()` directly (for typed output),
 * then passes the output here for side effects via `afterPrompt()`.
 */
export class ArchitectBridge {
  private restoredChats = new Set<string>();

  constructor(
    private readonly architect: ArchitectLike,
    private readonly awarenessCollector: ArchitectAwarenessCollector,
    private readonly vault: VaultLike,
    private readonly options: BridgeOptions = {},
  ) {}

  /** Call after architect.generatePrompt() to handle persistence, awareness, and escalation. */
  afterPrompt(detectedContext: Record<string, unknown>, emotionalTrajectory: string | undefined, escalationAlert: boolean | undefined, chatId: string): void {
    // Restore conversation state on first message per chat
    this.maybeRestore(chatId);

    // Update awareness collector
    const snapshot: ArchitectSnapshot = {
      detectedContext: {
        domain: String(detectedContext.domain ?? 'general'),
        emotionalRegister: String(detectedContext.emotionalRegister ?? 'neutral'),
        stakes: String(detectedContext.stakes ?? 'moderate'),
        complexity: String(detectedContext.complexity ?? 'moderate'),
        detectionConfidence: typeof detectedContext.detectionConfidence === 'number' ? detectedContext.detectionConfidence : undefined,
      },
      emotionalTrajectory,
      escalationAlert,
    };
    this.awarenessCollector.updateOutput(snapshot);

    // Persist conversation state
    this.persistState(chatId);

    // Fire escalation callback if alert present
    if (escalationAlert && this.options.onEscalation) {
      this.options.onEscalation(
        'Emotional escalation detected',
        snapshot.detectedContext,
      );
    }
  }

  private maybeRestore(chatId: string): void {
    if (this.restoredChats.has(chatId)) return;
    this.restoredChats.add(chatId);
    try {
      this.vault.get(`architect:chat:${chatId}`);
    } catch {
      // Vault locked or missing — proceed with fresh state
    }
  }

  private persistState(chatId: string): void {
    try {
      const summary = this.architect.getConversationSummary();
      const state = JSON.stringify({
        theme: summary.theme,
        messageCount: summary.messageCount,
        lastUpdated: Date.now(),
      });
      this.vault.add(`architect:chat:${chatId}`, state).catch(() => {});
    } catch {
      // Vault locked — skip persistence
    }
  }
}
