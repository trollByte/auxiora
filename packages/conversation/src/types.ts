/** States of a real-time conversation. */
export type ConversationState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'interrupted';

/** Events emitted during a conversation turn. */
export interface TurnEvent {
  type: 'user_speech' | 'ai_response' | 'interruption' | 'silence' | 'backchannel' | 'filler';
  timestamp: number;
  /** Transcribed text (for user_speech) or response text (for ai_response). */
  text?: string;
  /** Audio data associated with this event. */
  audio?: Buffer;
  /** Duration in milliseconds. */
  duration?: number;
}

/** Voice personality settings for natural conversation. */
export interface VoicePersonality {
  /** Speaking pace (0.5 = slow, 1.0 = normal, 1.5 = fast). */
  pace: number;
  /** Pitch adjustment (-1.0 to 1.0). */
  pitch: number;
  /** How often to use filler words (0 = never, 1 = frequently). */
  fillerStyle: number;
  /** Natural pause duration in milliseconds between sentences. */
  pauseDuration: number;
}

export const DEFAULT_VOICE_PERSONALITY: VoicePersonality = {
  pace: 1.0,
  pitch: 0.0,
  fillerStyle: 0.2,
  pauseDuration: 300,
};

/** Configuration for the conversation engine. */
export interface ConversationConfig {
  /** Voice activity detection sensitivity (0-1). */
  vadSensitivity: number;
  /** Maximum silence before ending a turn (ms). */
  silenceTimeout: number;
  /** Minimum speech duration to register as a turn (ms). */
  minSpeechDuration: number;
  /** Whether to enable interruption detection. */
  interruptionEnabled: boolean;
  /** Whether to insert filler words while thinking. */
  fillersEnabled: boolean;
  /** Whether to enable backchannel responses (uh-huh, yeah, etc.). */
  backchannelEnabled: boolean;
  /** Echo cancellation hint for the audio system. */
  echoCancellation: boolean;
}

export const DEFAULT_CONVERSATION_CONFIG: ConversationConfig = {
  vadSensitivity: 0.5,
  silenceTimeout: 1500,
  minSpeechDuration: 300,
  interruptionEnabled: true,
  fillersEnabled: true,
  backchannelEnabled: true,
  echoCancellation: true,
};

/** Callback for conversation turn events. */
export type TurnHandler = (event: TurnEvent) => void | Promise<void>;

/** Callback for state changes. */
export type StateHandler = (from: ConversationState, to: ConversationState) => void;
