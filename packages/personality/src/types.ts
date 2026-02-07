export interface ToneSettings {
  warmth: number;
  directness: number;
  humor: number;
  formality: number;
}

export interface SoulConfig {
  name: string;
  pronouns: string;
  tone: ToneSettings;
  expertise: string[];
  errorStyle: string;
  catchphrases: Record<string, string>;
  boundaries: {
    neverJokeAbout: string[];
    neverAdviseOn: string[];
  };
}

export interface PersonalityTemplate {
  id: string;
  name: string;
  description: string;
  preview: string;
  soulContent: string;
}
