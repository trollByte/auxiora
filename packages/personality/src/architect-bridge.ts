import type { ArchitectAwarenessCollector, ArchitectSnapshot } from './architect-awareness-collector.js';

export interface ArchitectLike {
  generatePrompt(userMessage: string): {
    basePrompt: string;
    contextModifier: string;
    fullPrompt: string;
    activeTraits: unknown[];
    detectedContext: {
      domain: string;
      emotionalRegister: string;
      stakes: string;
      complexity: string;
      detectionConfidence: number;
      conversationTheme?: string;
    };
    emotionalTrajectory: string;
    escalationAlert?: string;
    recommendation?: unknown;
  };
  getTraitMix(context: unknown): Record<string, number>;
  getConversationSummary(): { theme: string | null; messageCount: number };
}

export interface VaultLike {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  has(key: string): boolean;
}

export interface BridgeOptions {
  onEscalation?: (alert: string, context: ArchitectSnapshot['detectedContext']) => void;
}

export class ArchitectBridge {
  private restoredChats = new Set<string>();

  constructor(
    private readonly architect: ArchitectLike,
    private readonly awarenessCollector: ArchitectAwarenessCollector,
    private readonly vault: VaultLike,
    private readonly options: BridgeOptions = {},
  ) {}

  processMessage(userMessage: string, chatId: string) {
    // Restore conversation state on first message per chat
    this.maybeRestore(chatId);

    const output = this.architect.generatePrompt(userMessage);

    // Update awareness collector
    const snapshot: ArchitectSnapshot = {
      detectedContext: output.detectedContext,
      emotionalTrajectory: output.emotionalTrajectory,
      escalationAlert: output.escalationAlert,
    };
    this.awarenessCollector.updateOutput(snapshot);

    // Persist conversation state
    this.persistState(chatId);

    // Fire escalation callback if alert present
    if (output.escalationAlert && this.options.onEscalation) {
      this.options.onEscalation(output.escalationAlert, output.detectedContext);
    }

    return output;
  }

  private maybeRestore(chatId: string): void {
    if (this.restoredChats.has(chatId)) return;
    this.restoredChats.add(chatId);
    try {
      const stored = this.vault.get(`architect:chat:${chatId}`);
      if (stored) {
        // State exists — marked as restored. Full ConversationContext.restore()
        // integration happens in the runtime glue (Task 5).
      }
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
      this.vault.set(`architect:chat:${chatId}`, state);
    } catch {
      // Vault locked — skip persistence
    }
  }
}
