#!/usr/bin/env npx tsx
/**
 * Manual verification script for The Architect personality engine.
 * Runs generatePrompt against sample messages and prints the
 * detected context, top active traits with sources, and the
 * context modifier for each.
 *
 * Usage: npx tsx scripts/test-architect.ts
 */

import { createArchitect } from '../src/personalities/index.js';

const architect = createArchitect();

const samples = [
  'Is this secure? We need to audit the firewall rules for vulnerabilities — check for threat vectors and potential exploit paths',
  "I'm drowning and overwhelmed, everything is piling up and I can't keep up — help me prioritize",
  'We just got breached — this is a P1 incident and the outage is escalating, media is calling',
  'Help me prep for my 1:1 with Jake — I want to give him coaching and feedback for his career growth, they seem disengaged',
  'How should we architect the CNAPP platform migration? I need to think about architecture, design, and scalability',
];

const SEPARATOR = '═'.repeat(80);
const DIVIDER = '─'.repeat(80);

console.log(SEPARATOR);
console.log('  The Architect — Personality Engine Verification');
console.log(SEPARATOR);
console.log();

for (const message of samples) {
  const output = architect.generatePrompt(message);
  const ctx = output.detectedContext;

  console.log(DIVIDER);
  console.log(`MESSAGE: "${message.slice(0, 90)}${message.length > 90 ? '...' : ''}"`);
  console.log(DIVIDER);
  console.log();

  console.log('DETECTED CONTEXT:');
  console.log(`  Domain:    ${ctx.domain}`);
  console.log(`  Emotion:   ${ctx.emotionalRegister}`);
  console.log(`  Complexity:${ctx.complexity}`);
  console.log(`  Stakes:    ${ctx.stakes}`);
  console.log(`  Mode:      ${ctx.mode}`);
  console.log();

  console.log('TOP 5 ACTIVE TRAITS:');
  for (const source of output.activeTraits.slice(0, 5)) {
    console.log(`  [${source.traitKey}] — ${source.sourceName}`);
    console.log(`    Source: ${source.sourceWork}`);
    console.log(`    Instruction: ${source.behavioralInstruction.slice(0, 100)}...`);
  }
  console.log();

  console.log('CONTEXT MODIFIER:');
  for (const line of output.contextModifier.split('\n')) {
    console.log(`  ${line}`);
  }
  console.log();
}

console.log(SEPARATOR);
console.log(`  Verified ${samples.length} sample messages across ${architect.listContextDomains().length} available domains`);
console.log(SEPARATOR);
