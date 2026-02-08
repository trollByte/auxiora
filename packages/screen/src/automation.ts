import type { TrustGate } from '@auxiora/autonomy';
import type { DesktopAction, ScreenConfig } from './types.js';
import { DEFAULT_SCREEN_CONFIG } from './types.js';

/** Result of an automation action. */
export interface AutomationResult {
  success: boolean;
  action: DesktopAction;
  error?: string;
}

/** Backend interface for performing desktop automation. */
export interface AutomationBackend {
  click(x: number, y: number, button?: string, clickCount?: number): Promise<void>;
  typeText(text: string): Promise<void>;
  keypress(key: string): Promise<void>;
  scroll(deltaX: number, deltaY: number): Promise<void>;
}

/**
 * Desktop automation with trust-gated actions.
 * Every action is checked against TrustGate before execution.
 */
export class DesktopAutomation {
  private backend: AutomationBackend;
  private gate: TrustGate;
  private config: ScreenConfig;

  constructor(backend: AutomationBackend, gate: TrustGate, config?: Partial<ScreenConfig>) {
    this.backend = backend;
    this.gate = gate;
    this.config = { ...DEFAULT_SCREEN_CONFIG, ...config };
  }

  /** Execute a desktop action (trust-gated). */
  async execute(action: DesktopAction): Promise<AutomationResult> {
    if (!this.config.automationEnabled) {
      return { success: false, action, error: 'Desktop automation is disabled' };
    }

    const gateResult = this.gate.gate(
      'system',
      `screen:${action.type}`,
      this.config.automationRequiredTrust as 0 | 1 | 2 | 3 | 4,
    );
    if (!gateResult.allowed) {
      return { success: false, action, error: gateResult.message };
    }

    try {
      switch (action.type) {
        case 'click': {
          const target = action.target;
          if (!target || typeof target === 'string') {
            return { success: false, action, error: 'Click requires x,y coordinates' };
          }
          await this.backend.click(
            target.x,
            target.y,
            action.params?.button ?? 'left',
            action.params?.clickCount ?? 1,
          );
          break;
        }
        case 'type': {
          const text = action.params?.text;
          if (!text) {
            return { success: false, action, error: 'Type action requires text' };
          }
          await this.backend.typeText(text);
          break;
        }
        case 'keypress': {
          const key = action.params?.key;
          if (!key) {
            return { success: false, action, error: 'Keypress action requires key' };
          }
          await this.backend.keypress(key);
          break;
        }
        case 'scroll': {
          await this.backend.scroll(
            action.params?.deltaX ?? 0,
            action.params?.deltaY ?? 0,
          );
          break;
        }
        default:
          return { success: false, action, error: `Unknown action type: ${(action as any).type}` };
      }
      return { success: true, action };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, action, error: message };
    }
  }

  /** Click at coordinates (trust-gated). */
  async click(x: number, y: number, button: 'left' | 'right' | 'middle' = 'left'): Promise<AutomationResult> {
    return this.execute({ type: 'click', target: { x, y }, params: { button } });
  }

  /** Type text (trust-gated). */
  async type(text: string): Promise<AutomationResult> {
    return this.execute({ type: 'type', params: { text } });
  }

  /** Press a key combo (trust-gated). */
  async keypress(key: string): Promise<AutomationResult> {
    return this.execute({ type: 'keypress', params: { key } });
  }

  /** Scroll (trust-gated). */
  async scroll(deltaX: number, deltaY: number): Promise<AutomationResult> {
    return this.execute({ type: 'scroll', params: { deltaX, deltaY } });
  }

  /** Find an element by description and click it (trust-gated). */
  async findAndClick(description: string): Promise<AutomationResult> {
    return this.execute({ type: 'click', target: description });
  }
}
