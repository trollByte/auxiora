/**
 * Content-aware token estimation.
 *
 * Replaces the naive `content.length / 4` heuristic with content-type
 * detection that applies tuned ratios for code, CJK text, and prose.
 */

/* ------------------------------------------------------------------ */
/*  Character class patterns                                           */
/* ------------------------------------------------------------------ */

/** CJK Unified Ideographs + Hiragana + Katakana + Hangul */
const CJK_PATTERN = /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/g;

/** Common code syntax characters */
const CODE_PATTERN = /[{}[\];=><()|&!~^%+\-*/\\@#$?:,]/g;

/* ------------------------------------------------------------------ */
/*  Ratios (chars per token)                                           */
/* ------------------------------------------------------------------ */

/** English prose: ~4 characters per token */
const PROSE_RATIO = 4;

/** Code/JSON: ~3 characters per token (more operators, short identifiers) */
const CODE_RATIO = 3;

/** CJK text: ~2 characters per token (each ideograph ~ 1 token) */
const CJK_RATIO = 2;

/* ------------------------------------------------------------------ */
/*  Thresholds for content classification                              */
/* ------------------------------------------------------------------ */

/** Content with >30% CJK chars is classified as CJK-heavy */
const CJK_THRESHOLD = 0.3;

/** Content with >8% code syntax chars is classified as code-heavy */
const CODE_THRESHOLD = 0.08;

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Estimate the number of tokens in a string using content-aware heuristics.
 *
 * Detects the proportion of CJK characters and code syntax characters,
 * then applies a weighted blend of per-type ratios.
 *
 * @returns Estimated token count (minimum 1).
 */
export function estimateTokens(content: string): number {
  if (content.length === 0) return 1;

  const len = content.length;

  // Count character classes
  const cjkMatches = content.match(CJK_PATTERN);
  const codeMatches = content.match(CODE_PATTERN);
  const cjkCount = cjkMatches?.length ?? 0;
  const codeCount = codeMatches?.length ?? 0;

  const cjkFraction = cjkCount / len;
  const codeFraction = codeCount / len;
  const proseFraction = 1 - cjkFraction - codeFraction;

  // Compute weighted ratio
  let effectiveRatio: number;

  if (cjkFraction >= CJK_THRESHOLD) {
    // CJK-dominant: blend CJK and prose ratios
    effectiveRatio = cjkFraction * CJK_RATIO + proseFraction * PROSE_RATIO + codeFraction * CODE_RATIO;
  } else if (codeFraction >= CODE_THRESHOLD) {
    // Code-dominant: blend code and prose ratios
    effectiveRatio = codeFraction * CODE_RATIO + proseFraction * PROSE_RATIO + cjkFraction * CJK_RATIO;
  } else {
    // Default: prose
    effectiveRatio = PROSE_RATIO;
  }

  return Math.max(Math.ceil(len / effectiveRatio), 1);
}
