import * as fs from 'node:fs/promises';
import {
  getSoulPath,
  getAgentsPath,
  getIdentityPath,
  getUserPath,
} from '@auxiora/core';
import type { AgentIdentity } from '@auxiora/config';
import type { ModeLoader } from './mode-loader.js';
import type { SessionModeState, UserPreferences, ModeId } from './types.js';

export class PromptAssembler {
  private agent: AgentIdentity;
  private modeLoader: ModeLoader;
  private personalityAdapter?: { getPromptModifier(): Promise<string | null> };
  private basePrompt: string = '';

  constructor(
    agent: AgentIdentity,
    modeLoader: ModeLoader,
    personalityAdapter?: { getPromptModifier(): Promise<string | null> },
  ) {
    this.agent = agent;
    this.modeLoader = modeLoader;
    this.personalityAdapter = personalityAdapter;
  }

  async buildBase(): Promise<string> {
    const parts: string[] = [];

    // 1. Identity preamble
    parts.push(this.buildIdentityPreamble(this.agent));

    // 2. Personality adaptations from living memory
    if (this.personalityAdapter) {
      const modifier = await this.personalityAdapter.getPromptModifier();
      if (modifier) {
        parts.push(modifier);
      }
    }

    // 3. SOUL.md
    try {
      const soul = await fs.readFile(getSoulPath(), 'utf-8');
      parts.push(soul);
    } catch {
      // No SOUL.md
    }

    // 4. AGENTS.md
    try {
      const agents = await fs.readFile(getAgentsPath(), 'utf-8');
      parts.push(agents);
    } catch {
      // No AGENTS.md
    }

    // 5. IDENTITY.md
    try {
      const identity = await fs.readFile(getIdentityPath(), 'utf-8');
      parts.push(identity);
    } catch {
      // No IDENTITY.md
    }

    // 6. USER.md
    try {
      const user = await fs.readFile(getUserPath(), 'utf-8');
      parts.push(`\n## About the User\n${user}`);
    } catch {
      // No USER.md
    }

    if (parts.length > 1) {
      this.basePrompt = parts.join('\n\n---\n\n');
    } else {
      this.basePrompt = `You are ${this.agent.name}, a helpful AI assistant. Be concise, accurate, and friendly.`;
    }

    return this.basePrompt;
  }

  getBasePrompt(): string {
    return this.basePrompt;
  }

  enrichForMessage(
    modeState: SessionModeState | undefined,
    memorySection: string | null,
    preferences?: UserPreferences,
  ): string {
    const parts: string[] = [this.basePrompt];

    // Inject active mode instructions
    if (modeState && modeState.activeMode !== 'auto' && modeState.activeMode !== 'off') {
      const mode = this.modeLoader.get(modeState.activeMode as ModeId);
      if (mode) {
        parts.push(`\n\n## Active Mode: ${mode.name}\n${mode.promptContent}`);
      }
    }

    // Inject preference overrides
    if (preferences) {
      const rendered = this.renderPreferences(preferences);
      if (rendered) {
        parts.push(`\n\n## User Preferences\n${rendered}`);
      }
    }

    // Inject memories
    if (memorySection) {
      parts.push(memorySection);
    }

    return parts.join('');
  }

  renderPreferences(prefs: UserPreferences): string {
    const lines: string[] = [];

    if (prefs.verbosity <= 0.2) {
      lines.push('- Be extremely concise. Use bullet points and short sentences.');
    } else if (prefs.verbosity >= 0.8) {
      lines.push('- Be thorough and detailed. Explain reasoning and provide examples.');
    }

    if (prefs.formality <= 0.2) {
      lines.push('- Use casual, conversational language.');
    } else if (prefs.formality >= 0.8) {
      lines.push('- Use formal, professional language.');
    }

    if (prefs.proactiveness >= 0.8) {
      lines.push('- Proactively suggest next steps, improvements, and related topics.');
    } else if (prefs.proactiveness <= 0.2) {
      lines.push('- Only answer what is directly asked. Do not volunteer extra information.');
    }

    if (prefs.riskTolerance >= 0.8) {
      lines.push('- Be bold in recommendations. Favor decisive action over excessive caution.');
    } else if (prefs.riskTolerance <= 0.2) {
      lines.push('- Be cautious. Highlight risks and caveats prominently.');
    }

    if (prefs.humor >= 0.8) {
      lines.push('- Feel free to be witty and playful in responses.');
    } else if (prefs.humor <= 0.2) {
      lines.push('- Keep responses serious and professional. Avoid humor.');
    }

    if (prefs.feedbackStyle === 'sandwich') {
      lines.push('- When giving feedback, use the sandwich method: positive → constructive → positive.');
    } else if (prefs.feedbackStyle === 'gentle') {
      lines.push('- Give feedback gently with empathy. Lead with understanding.');
    }

    if (prefs.expertiseAssumption === 'beginner') {
      lines.push('- Explain concepts from first principles. Define technical terms.');
    } else if (prefs.expertiseAssumption === 'expert') {
      lines.push('- Assume deep technical knowledge. Skip basic explanations.');
    }

    return lines.join('\n');
  }

  private buildIdentityPreamble(agent: AgentIdentity): string {
    const lines: string[] = ['# Agent Identity'];
    lines.push(`You are ${agent.name} (${agent.pronouns}).`);

    lines.push('');
    lines.push('## Personality');
    lines.push(
      `Warmth: ${agent.tone.warmth}/1.0 | Directness: ${agent.tone.directness}/1.0 | Humor: ${agent.tone.humor}/1.0 | Formality: ${agent.tone.formality}/1.0`,
    );
    lines.push(`Error handling style: ${agent.errorStyle}`);

    if (agent.expertise.length > 0) {
      lines.push('');
      lines.push('## Expertise');
      for (const area of agent.expertise) {
        lines.push(`- ${area}`);
      }
    }

    const phrases = Object.entries(agent.catchphrases).filter(([, v]) => v);
    if (phrases.length > 0) {
      lines.push('');
      lines.push('## Catchphrases');
      for (const [key, value] of phrases) {
        lines.push(`- ${key.charAt(0).toUpperCase() + key.slice(1)}: ${value}`);
      }
    }

    const hasJokeBoundaries = agent.boundaries.neverJokeAbout.length > 0;
    const hasAdviseBoundaries = agent.boundaries.neverAdviseOn.length > 0;
    if (hasJokeBoundaries || hasAdviseBoundaries) {
      lines.push('');
      lines.push('## Boundaries');
      if (hasJokeBoundaries) {
        lines.push(`Never joke about: ${agent.boundaries.neverJokeAbout.join(', ')}`);
      }
      if (hasAdviseBoundaries) {
        lines.push(`Never advise on: ${agent.boundaries.neverAdviseOn.join(', ')}`);
      }
    }

    return lines.join('\n');
  }
}
