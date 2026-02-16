#!/usr/bin/env npx tsx
/**
 * Full Phase 1–4 verification script for The Architect personality engine.
 *
 * Simulates a multi-turn conversation with context shifts, emotional escalation,
 * and crisis override. Demonstrates every subsystem:
 *   - Context detection + correction learning
 *   - Conversation theme establishment + tangent resistance
 *   - Emotional tracking + trajectory detection
 *   - Custom weights / presets
 *   - Prompt assembly with provenance
 *   - Recommender suggestions
 *   - Conversation export (Markdown)
 *
 * Usage: npx tsx scripts/test-architect.ts
 */

import {
  createArchitect,
  InMemoryEncryptedStorage,
  ConversationExporter,
} from '../src/personalities/index.js';
import type { ChatMessage } from '../src/personalities/index.js';

const SEPARATOR = '═'.repeat(80);
const DIVIDER  = '─'.repeat(80);

// ── Setup ────────────────────────────────────────────────────────────────────

const storage = new InMemoryEncryptedStorage();
const architect = createArchitect(storage);
await architect.initialize();

// Load a preset to demonstrate custom weights
await architect.loadPreset('the_ciso');
const overrides = architect.getActiveOverrides();

console.log(SEPARATOR);
console.log('  The Architect — Full Phase 1–4 Pipeline Verification');
console.log(SEPARATOR);
console.log();
console.log('PRESET LOADED: the_ciso');
console.log('  Active weight overrides:');
for (const [trait, offset] of Object.entries(overrides)) {
  console.log(`    ${trait}: ${offset >= 0 ? '+' : ''}${offset}`);
}
console.log();

// ── Scenarios ────────────────────────────────────────────────────────────────

const scenarios = [
  'Help me review this terraform config for security issues — check for vulnerabilities, threat vectors, and CVE exposure in the IAM policies',
  'Actually, how should I architect the CNAPP migration overall? I need to think about architecture design and system scalability trade-offs',
  'My analyst Jake seems disengaged, I have a 1:1 tomorrow — I want to give him coaching feedback for his career growth and development',
  'This is getting overwhelming, I have the FCA audit next week too and everything is piling up',
  'WE JUST GOT AN ALERT — lateral movement detected in staging environment from CrowdStrike, potential breach, incident response needed NOW',
  'OK false alarm, it was the pen test team. We shipped the Wiz migration today! Great work team, celebrating this milestone',
];

const history: Array<{ role: string; content: string }> = [];
const chatMessages: ChatMessage[] = [];
const baseTime = Date.now();

for (let i = 0; i < scenarios.length; i++) {
  const message = scenarios[i];
  const output = architect.generatePrompt(message, history);
  const ctx = output.detectedContext;

  console.log(DIVIDER);
  console.log(`TURN ${i + 1}: "${message.slice(0, 90)}${message.length > 90 ? '...' : ''}"`);
  console.log(DIVIDER);
  console.log();

  // Context detection
  console.log('DETECTED CONTEXT:');
  console.log(`  Domain:     ${ctx.domain}`);
  console.log(`  Emotion:    ${ctx.emotionalRegister}`);
  console.log(`  Stakes:     ${ctx.stakes}`);
  console.log(`  Complexity: ${ctx.complexity}`);
  if (output.emotionalTrajectory) {
    console.log(`  Trajectory: ${output.emotionalTrajectory}`);
  }
  if (ctx.conversationTheme) {
    console.log(`  Theme:      ${ctx.conversationTheme}`);
  }
  if (ctx.corrected) {
    console.log(`  CORRECTED:  ${ctx.originalDomain} → ${ctx.domain}`);
  }
  if (ctx.themeOverridden) {
    console.log(`  THEME OVERRIDE: raw=${ctx.rawDetectedDomain} → effective=${ctx.domain}`);
  }
  if (ctx.detectionConfidence != null) {
    console.log(`  Confidence: ${(ctx.detectionConfidence * 100).toFixed(0)}%`);
  }
  console.log();

  // Top 5 active traits
  console.log('TOP 5 ACTIVE TRAITS:');
  for (const source of output.activeTraits.slice(0, 5)) {
    console.log(`  [${source.traitKey}] — ${source.sourceName}`);
    console.log(`    "${source.behavioralInstruction.slice(0, 100)}${source.behavioralInstruction.length > 100 ? '...' : ''}"`);
  }
  console.log();

  // Context modifier summary (first 3 lines)
  const modifierLines = output.contextModifier.split('\n').filter(l => l.trim());
  console.log('CONTEXT MODIFIER (first 3 lines):');
  for (const line of modifierLines.slice(0, 3)) {
    console.log(`  ${line}`);
  }
  console.log(`  ... (${modifierLines.length} total lines)`);
  console.log();

  // Recommendation
  if (output.recommendation) {
    console.log(`RECOMMENDATION: Switch to ${output.recommendation.suggestedDomain}`);
    console.log(`  Reason: ${output.recommendation.reason}`);
    console.log(`  Source: ${output.recommendation.source}`);
    console.log();
  }

  // Escalation alert
  if (output.escalationAlert) {
    console.log('⚠️  ESCALATION ALERT: Sustained high-intensity frustration detected');
    console.log();
  }

  // Build chat message for export
  chatMessages.push({
    role: 'user',
    content: message,
    timestamp: baseTime + i * 2000,
  });
  chatMessages.push({
    role: 'assistant',
    content: `[Simulated response for turn ${i + 1}]`,
    timestamp: baseTime + i * 2000 + 1000,
    metadata: {
      domain: ctx.domain,
      emotionalRegister: ctx.emotionalRegister,
      emotionalTrajectory: output.emotionalTrajectory,
      conversationTheme: ctx.conversationTheme,
      corrected: ctx.corrected,
      originalDomain: ctx.originalDomain,
      confidence: ctx.detectionConfidence,
      stakes: ctx.stakes,
      complexity: ctx.complexity,
      activeTraits: output.activeTraits,
      customWeightsApplied: Object.keys(overrides).length > 0 ? overrides : undefined,
      recommendation: output.recommendation,
    },
  });

  history.push({ role: 'user', content: message });
  history.push({ role: 'assistant', content: `[Response ${i + 1}]` });
}

// ── Conversation Export ──────────────────────────────────────────────────────

console.log(SEPARATOR);
console.log('  CONVERSATION EXPORT (Markdown)');
console.log(SEPARATOR);
console.log();

const exportResult = architect.exportConversation(chatMessages, 'demo-conv-001');
const exporter = new ConversationExporter();
const markdown = exporter.toMarkdown(exportResult);
console.log(markdown);

// ── Summary Stats ────────────────────────────────────────────────────────────

console.log(SEPARATOR);
console.log('  SUMMARY');
console.log(SEPARATOR);
console.log();

console.log('EXPORT SUMMARY:');
console.log(`  Total messages: ${exportResult.messageCount}`);
console.log(`  Dominant contexts:`);
for (const ctx of exportResult.summary.dominantContexts) {
  console.log(`    ${ctx.domain}: ${ctx.percentage.toFixed(1)}%`);
}
console.log(`  Emotional arc: ${exportResult.summary.emotionalArc.join(' → ')}`);
console.log(`  Corrections applied: ${exportResult.summary.correctionsApplied}`);
console.log(`  Unique sources: ${exportResult.summary.uniqueSourcesReferenced.join(', ')}`);
console.log();

console.log('CORRECTION STATS:');
const stats = architect.getCorrectionStats();
console.log(`  Total corrections: ${stats.totalCorrections}`);
console.log(`  Patterns learned: ${stats.patternCount}`);
console.log();

console.log('CONVERSATION STATE:');
const convSummary = architect.getConversationSummary();
console.log(`  Theme: ${convSummary.theme ?? 'none'}`);
console.log(`  Message count: ${convSummary.messageCount}`);
console.log(`  Theme established: ${convSummary.themeEstablished}`);
console.log();

console.log('EMOTIONAL STATE:');
const emotionalState = architect.getEmotionalState();
console.log(`  Current emotion: ${emotionalState.emotion}`);
console.log(`  Intensity: ${emotionalState.intensity.toFixed(2)}`);
console.log(`  Trajectory: ${emotionalState.trajectory}`);
console.log(`  Escalation alert: ${emotionalState.escalationAlert}`);
console.log();

console.log('ACTIVE WEIGHT OVERRIDES:');
for (const [trait, offset] of Object.entries(architect.getActiveOverrides())) {
  console.log(`  ${trait}: ${offset >= 0 ? '+' : ''}${offset}`);
}
console.log();

console.log('AVAILABLE PRESETS:');
for (const [key, preset] of Object.entries(architect.listPresets())) {
  console.log(`  ${key}: ${preset.name} — ${preset.description}`);
}
console.log();

console.log(SEPARATOR);
console.log(`  Verified ${scenarios.length} scenarios across full Phase 1–4 pipeline`);
console.log(`  ${architect.listContextDomains().length} domains | ${Object.keys(architect.listPresets()).length} presets | ${exportResult.summary.uniqueSourcesReferenced.length} sources referenced`);
console.log(SEPARATOR);
