import type { TaskClassification, TaskType, RoutingContext } from './types.js';

const CODE_PATTERNS = [
  /\b(write|implement|create|build|fix|debug|refactor|optimize)\b.*\b(function|class|method|code|component|api|endpoint|module)\b/i,
  /\b(function|class|interface|const|let|var|import|export|return|async|await)\b/,
  /```/,
  /\.(ts|js|py|rs|go|java|cpp|c|rb|php|swift|kt)\b/,
  /\b(typescript|javascript|python|rust|golang|java)\b/i,
  /\b(debug|refactor|optimize|lint|compile|transpile)\b/i,
  /\b(bug|error|exception|stack\s?trace|segfault)\b/i,
];

const REASONING_PATTERNS = [
  /\b(analyze|explain|why|compare|evaluate|think\s+about|reason|assess|consider)\b/i,
  /\b(pros?\s+and\s+cons?|trade-?\s?offs?|advantages?\s+and\s+disadvantages?)\b/i,
  /\b(what\s+is\s+the\s+difference|how\s+does\s+.*\s+work|what\s+are\s+the\s+implications)\b/i,
];

const CREATIVE_PATTERNS = [
  /\b(write\s+a\s+story|brainstorm|come\s+up\s+with|design|creative|imagine)\b/i,
  /\b(poem|essay|narrative|fiction|blog\s+post|article)\b/i,
  /\b(rewrite|rephrase|paraphrase)\b/i,
];

const VISION_PATTERNS = [
  /\b(look\s+at\s+this\s+image|screenshot|photo|picture|diagram|chart)\b/i,
  /\b(what\s+do\s+you\s+see|describe\s+this\s+image|analyze\s+this\s+image)\b/i,
];

const LONG_CONTEXT_PATTERNS = [
  /\b(summarize\s+this\s+document|summarize\s+the\s+following|analyze\s+this\s+entire)\b/i,
  /\b(full\s+codebase|entire\s+file|whole\s+document)\b/i,
];

const FAST_PATTERNS = [
  /\b(quick\s+question)\b/i,
  /^(what\s+is|who\s+is|when\s+was|how\s+many)\b/i,
];

const PRIVATE_PATTERNS = [
  /\b(password|secret|salary|medical|confidential|ssn|social\s+security|credit\s+card)\b/i,
  /\b(private|sensitive|personal\s+data|health\s+record|bank\s+account)\b/i,
];

const IMAGE_GEN_PATTERNS = [
  /\b(generate\s+(an?\s+)?image|create\s+(an?\s+)?picture|draw|make\s+a\s+logo|illustration)\b/i,
  /\b(image\s+of|picture\s+of|photo\s+of)\b/i,
];

const TOOL_PATTERNS = [
  /\b(search|look\s+up|find|fetch|browse|run|execute|calculate|compute)\b/i,
  /\b(file|directory|folder|database|api|endpoint|url)\b/i,
];

interface PatternScore {
  type: TaskType;
  patterns: RegExp[];
  weight: number;
}

const PATTERN_SCORES: PatternScore[] = [
  { type: 'code', patterns: CODE_PATTERNS, weight: 1.0 },
  { type: 'reasoning', patterns: REASONING_PATTERNS, weight: 0.9 },
  { type: 'creative', patterns: CREATIVE_PATTERNS, weight: 0.9 },
  { type: 'vision', patterns: VISION_PATTERNS, weight: 1.0 },
  { type: 'long-context', patterns: LONG_CONTEXT_PATTERNS, weight: 0.8 },
  { type: 'fast', patterns: FAST_PATTERNS, weight: 0.6 },
  { type: 'private', patterns: PRIVATE_PATTERNS, weight: 1.0 },
  { type: 'image-gen', patterns: IMAGE_GEN_PATTERNS, weight: 1.0 },
];

export class TaskClassifier {
  classify(message: string, context?: RoutingContext): TaskClassification {
    const inputTokenEstimate = Math.ceil(message.length / 4);
    const hasImages = context?.hasImages ?? false;

    // Score each task type
    const scores = new Map<TaskType, number>();

    for (const { type, patterns, weight } of PATTERN_SCORES) {
      let matchCount = 0;
      for (const pattern of patterns) {
        if (pattern.test(message)) {
          matchCount++;
        }
      }
      if (matchCount > 0) {
        scores.set(type, (matchCount / patterns.length) * weight);
      }
    }

    // Context-based overrides
    if (hasImages) {
      scores.set('vision', Math.max(scores.get('vision') ?? 0, 0.9));
    }

    if (inputTokenEstimate > 50000 || (context?.conversationTokens && context.conversationTokens > 50000)) {
      scores.set('long-context', Math.max(scores.get('long-context') ?? 0, 0.7));
    }

    // "fast" classification only applies for short messages
    const wordCount = message.trim().split(/\s+/).length;
    if (wordCount >= 20 || message.includes('```')) {
      scores.delete('fast');
    } else if (wordCount < 20 && scores.has('fast')) {
      scores.set('fast', Math.max(scores.get('fast') ?? 0, 0.8));
    }

    // Determine the winner
    let bestType: TaskType = 'general';
    let bestScore = 0;

    for (const [type, score] of scores) {
      if (score > bestScore) {
        bestScore = score;
        bestType = type;
      }
    }

    // Confidence: if best score is 0, confidence is low for general
    const confidence = bestScore > 0 ? Math.min(bestScore, 1.0) : 0.3;

    // Detect if tools might be needed
    const requiresTools = TOOL_PATTERNS.some((p) => p.test(message));

    // Detect sensitivity
    let sensitivityLevel: 'normal' | 'private' | 'secret' = 'normal';
    if (scores.has('private')) {
      sensitivityLevel = (scores.get('private')! > 0.5) ? 'secret' : 'private';
    }

    return {
      type: bestType,
      confidence,
      inputTokenEstimate,
      requiresTools,
      requiresVision: hasImages || bestType === 'vision',
      sensitivityLevel,
    };
  }
}
