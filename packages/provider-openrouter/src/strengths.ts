export function inferStrengths(modelId: string): string[] {
  const strengths: string[] = [];
  const id = modelId.toLowerCase();

  if (/opus|pro[-/]|large|72b|70b|405b|671b/.test(id)) strengths.push('reasoning', 'code');
  if (/haiku|mini|flash|small|8b|7b|1b/.test(id)) strengths.push('fast');
  if (/128k|200k|1m|long/.test(id)) strengths.push('long-context');
  if (/vision|4o|claude-3|gemini|gpt-5/.test(id)) strengths.push('vision');
  if (/code|coder|deepseek-coder|starcoder|codestral/.test(id)) strengths.push('code');
  if (/creative|writing|novelist/.test(id)) strengths.push('creative');

  if (strengths.length === 0) strengths.push('general');
  return [...new Set(strengths)];
}
