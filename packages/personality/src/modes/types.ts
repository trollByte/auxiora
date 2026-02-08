export const MODE_IDS = [
  'operator',
  'analyst',
  'advisor',
  'writer',
  'socratic',
  'legal',
  'roast',
  'companion',
] as const;

export type ModeId = (typeof MODE_IDS)[number];

export interface ModeSignal {
  phrase: string;
  weight: number;
}

export interface ModeTemplate {
  id: ModeId;
  name: string;
  description: string;
  promptContent: string;
  signals: ModeSignal[];
}

export interface ModeDetectionResult {
  mode: ModeId;
  confidence: number;
  candidates: Array<{ mode: ModeId; score: number }>;
}

export interface UserPreferences {
  verbosity: number;       // 0-1: terse → verbose
  formality: number;       // 0-1: casual → formal
  proactiveness: number;   // 0-1: reactive → proactive
  riskTolerance: number;   // 0-1: cautious → bold
  humor: number;           // 0-1: serious → playful
  feedbackStyle: 'direct' | 'sandwich' | 'gentle';
  expertiseAssumption: 'beginner' | 'intermediate' | 'expert';
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  verbosity: 0.5,
  formality: 0.5,
  proactiveness: 0.5,
  riskTolerance: 0.5,
  humor: 0.3,
  feedbackStyle: 'direct',
  expertiseAssumption: 'intermediate',
};

export interface SessionModeState {
  activeMode: ModeId | 'auto' | 'off';
  autoDetected: boolean;
  lastAutoMode?: ModeId;
  lastSwitchAt?: number;
}

export const DEFAULT_SESSION_MODE_STATE: SessionModeState = {
  activeMode: 'auto',
  autoDetected: false,
};
