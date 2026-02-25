import type { SentimentLabel, SentimentResult } from './types.js';

const POSITIVE_WORDS = new Set([
  'good', 'great', 'awesome', 'amazing', 'excellent', 'fantastic', 'wonderful',
  'love', 'happy', 'glad', 'pleased', 'perfect', 'beautiful', 'brilliant',
  'thanks', 'thank', 'appreciate', 'helpful', 'nice', 'cool', 'best',
  'excited', 'enjoy', 'impressive', 'incredible', 'outstanding', 'superb',
  'delighted', 'thrilled', 'grateful', 'marvelous', 'terrific', 'splendid',
  'like', 'yes', 'agree', 'right', 'correct', 'exactly', 'absolutely',
  'well', 'fine', 'okay', 'sure', 'works', 'solved', 'fixed', 'done',
]);

const NEGATIVE_WORDS = new Set([
  'bad', 'terrible', 'awful', 'horrible', 'wrong', 'broken', 'error',
  'fail', 'failed', 'failure', 'bug', 'crash', 'issue', 'problem',
  'hate', 'angry', 'frustrated', 'annoyed', 'disappointed', 'confused',
  'ugly', 'slow', 'stuck', 'impossible', 'useless', 'waste', 'stupid',
  'worse', 'worst', 'never', 'nothing', 'nobody', 'nowhere', 'ugh',
  'damn', 'crap', 'sucks', 'annoying', 'painful', 'difficult', 'hard',
  'unfortunately', 'sadly', 'regret', 'sorry', 'no', 'not', 'cannot',
]);

const POSITIVE_EMOJI_PATTERNS = /[:\)]|:\)|:D|;\)|<3|❤|😊|😄|👍|🎉|✨|🙌|💯|🔥|⭐|😁|🥳|💪/g;
const NEGATIVE_EMOJI_PATTERNS = /[:\(]|:\(|:\/|😢|😡|😤|👎|💔|😞|😠|🤬|😭|😩|😫/g;

export class SentimentAnalyzer {
  analyzeSentiment(text: string): SentimentResult {
    const lower = text.toLowerCase();
    const words = lower.replace(/[^a-z0-9\s'-]/g, '').split(/\s+/).filter(Boolean);

    let positiveScore = 0;
    let negativeScore = 0;
    const matchedKeywords: string[] = [];

    // Word-based scoring
    for (const word of words) {
      if (POSITIVE_WORDS.has(word)) {
        positiveScore += 1;
        matchedKeywords.push(word);
      }
      if (NEGATIVE_WORDS.has(word)) {
        negativeScore += 1;
        matchedKeywords.push(word);
      }
    }

    // Emoji-based scoring
    const positiveEmojis = text.match(POSITIVE_EMOJI_PATTERNS);
    const negativeEmojis = text.match(NEGATIVE_EMOJI_PATTERNS);
    if (positiveEmojis) positiveScore += positiveEmojis.length * 1.5;
    if (negativeEmojis) negativeScore += negativeEmojis.length * 1.5;

    // Punctuation patterns
    const exclamationCount = (text.match(/!/g) || []).length;
    const questionCount = (text.match(/\?/g) || []).length;
    const capsRatio = this.getCapsRatio(text);

    // Exclamation marks boost existing sentiment
    if (exclamationCount > 0) {
      if (positiveScore > negativeScore) {
        positiveScore += exclamationCount * 0.3;
      } else if (negativeScore > positiveScore) {
        negativeScore += exclamationCount * 0.3;
      }
    }

    // ALL CAPS can indicate strong sentiment (frustration or excitement)
    if (capsRatio > 0.5 && words.length > 2) {
      if (negativeScore > positiveScore) {
        negativeScore += 1;
      } else if (positiveScore > negativeScore) {
        positiveScore += 1;
      }
    }

    // Negation handling: "not good", "don't like", etc.
    const negationCount = this.countNegations(lower);
    if (negationCount > 0 && positiveScore > negativeScore) {
      // Negation flips positive sentiment partially
      const flip = Math.min(negationCount, positiveScore);
      positiveScore -= flip;
      negativeScore += flip * 0.5;
    }

    const totalScore = positiveScore + negativeScore;
    let sentiment: SentimentLabel;
    let confidence: number;

    if (totalScore === 0) {
      sentiment = 'neutral';
      confidence = 0.5;
    } else {
      const ratio = positiveScore / totalScore;

      if (ratio > 0.6) {
        sentiment = 'positive';
        confidence = Math.min(0.4 + (ratio - 0.5) * 1.2, 0.95);
      } else if (ratio < 0.4) {
        sentiment = 'negative';
        confidence = Math.min(0.4 + (0.5 - ratio) * 1.2, 0.95);
      } else {
        sentiment = 'neutral';
        confidence = Math.max(0.3, 0.5 - Math.abs(0.5 - ratio) * 2);
      }

      // Boost confidence with more evidence
      if (totalScore >= 3) {
        confidence = Math.min(confidence + 0.1, 0.95);
      }
    }

    // Deduplicate keywords
    const uniqueKeywords = [...new Set(matchedKeywords)];

    return { sentiment, confidence, keywords: uniqueKeywords };
  }

  private getCapsRatio(text: string): number {
    const letters = text.replace(/[^a-zA-Z]/g, '');
    if (letters.length === 0) return 0;
    const upperCount = (text.match(/[A-Z]/g) || []).length;
    return upperCount / letters.length;
  }

  private countNegations(text: string): number {
    const negations = text.match(/\b(not|no|never|don't|doesn't|didn't|won't|wouldn't|can't|cannot|isn't|aren't|wasn't|weren't)\b/g);
    return negations ? negations.length : 0;
  }
}
