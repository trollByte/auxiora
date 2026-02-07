import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { loadConfig, saveConfig } from '@auxiora/config';
import type { Config } from '@auxiora/config';
import { getSoulPath, getWorkspacePath } from '@auxiora/core';
import { PersonalityManager } from '@auxiora/personality';
import type { OnboardingAnswers } from './types.js';

export interface ApplyResult {
  configSaved: boolean;
  personalityApplied: boolean;
  channelsEnabled: string[];
  provider: string;
  summary: string;
}

/**
 * Apply onboarding answers to the system configuration, personality, and channels.
 * The API key is returned in the result so the caller can store it in the vault
 * (the onboarding package does not depend on @auxiora/vault directly).
 */
export async function applyOnboarding(answers: OnboardingAnswers): Promise<ApplyResult> {
  const config = await loadConfig();

  // Set agent identity
  config.agent.name = answers.agentName;
  config.agent.pronouns = answers.pronouns;
  config.agent.personality = answers.personality;

  // Set AI provider
  config.provider.primary = answers.provider;

  // Enable selected channels
  const channelKeys = ['webchat', 'discord', 'telegram', 'slack'] as const;
  for (const key of channelKeys) {
    (config.channels[key] as { enabled: boolean }).enabled = answers.channels.includes(key);
  }

  await saveConfig(config);

  // Apply personality template
  let personalityApplied = false;
  try {
    const workspaceDir = getWorkspacePath();
    const templatesDir = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'personality', 'templates');
    const manager = new PersonalityManager(templatesDir, workspaceDir);
    await manager.applyTemplate(answers.personality);
    personalityApplied = true;
  } catch {
    // Template may not exist yet — write a minimal SOUL.md
    const soulPath = getSoulPath();
    await fs.mkdir(path.dirname(soulPath), { recursive: true });
    await fs.writeFile(
      soulPath,
      `---\nname: ${answers.agentName}\npronouns: ${answers.pronouns}\nerrorStyle: professional\ntone:\n  warmth: 0.6\n  directness: 0.5\n  humor: 0.3\n  formality: 0.5\n---\n`,
      'utf-8',
    );
    personalityApplied = true;
  }

  const enabledChannels = answers.channels.filter((ch) =>
    channelKeys.includes(ch as (typeof channelKeys)[number]),
  );

  const lines = [
    `Agent "${answers.agentName}" (${answers.pronouns}) configured.`,
    `Personality: ${answers.personality}`,
    `Provider: ${answers.provider}`,
    `Channels: ${enabledChannels.join(', ') || 'webchat'}`,
  ];

  return {
    configSaved: true,
    personalityApplied,
    channelsEnabled: enabledChannels,
    provider: answers.provider,
    summary: lines.join('\n'),
  };
}
