// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────
/** How many recent messages the sliding window considers. */
const WINDOW_SIZE = 5;
/** Emotions considered negative for escalation detection. */
const NEGATIVE_EMOTIONS = new Set(['frustrated', 'stressed']);
/** Minimum consecutive negative-and-increasing entries for escalation. */
const ESCALATION_MIN_STREAK = 3;
/** Minimum messages and intensity threshold for escalation alert. */
const ALERT_MIN_MESSAGES = 4;
const ALERT_INTENSITY_THRESHOLD = 0.7;
/** Minimum emotion changes in the window for volatile classification. */
const VOLATILE_CHANGE_THRESHOLD = 3;
// ────────────────────────────────────────────────────────────────────────────
// Intensity estimation
// ────────────────────────────────────────────────────────────────────────────
/**
 * Estimate emotional intensity from message text.
 *
 * Heuristic signals:
 * - Excessive punctuation (!! or ??)
 * - ALL CAPS segments
 * - Explicit intensity words ("extremely", "so", "really", "very")
 * - Profanity / frustration markers
 * - Message length (longer rants → higher intensity)
 */
export function estimateIntensity(message, emotion) {
    if (emotion === 'neutral')
        return 0.2;
    let intensity = 0.4; // base for any non-neutral emotion
    const lower = message.toLowerCase();
    // Punctuation intensity
    const exclamations = (message.match(/!/g) ?? []).length;
    const questions = (message.match(/\?/g) ?? []).length;
    if (exclamations >= 3)
        intensity += 0.15;
    else if (exclamations >= 1)
        intensity += 0.05;
    if (questions >= 3)
        intensity += 0.1;
    // CAPS intensity
    const capsRatio = message.replace(/[^A-Z]/g, '').length / Math.max(message.replace(/\s/g, '').length, 1);
    if (capsRatio > 0.5 && message.length > 10)
        intensity += 0.15;
    // Intensity words
    const intensifiers = ['extremely', 'incredibly', 'absolutely', 'totally', 'completely', 'so frustrated', 'so tired', 'really', 'very', 'cannot believe', "can't stand"];
    for (const word of intensifiers) {
        if (lower.includes(word)) {
            intensity += 0.08;
            break; // only count once
        }
    }
    // Frustration markers
    const frustrationMarkers = ['ugh', 'argh', 'ffs', 'wtf', 'omg', 'seriously', 'again', 'still broken', 'still not working'];
    for (const marker of frustrationMarkers) {
        if (lower.includes(marker)) {
            intensity += 0.08;
            break;
        }
    }
    // Length-based (longer messages in negative emotions → venting → higher intensity)
    if (NEGATIVE_EMOTIONS.has(emotion)) {
        const wordCount = message.split(/\s+/).length;
        if (wordCount > 50)
            intensity += 0.1;
        else if (wordCount > 25)
            intensity += 0.05;
    }
    return Math.min(intensity, 1.0);
}
// ────────────────────────────────────────────────────────────────────────────
// EmotionalTracker
// ────────────────────────────────────────────────────────────────────────────
/**
 * Tracks emotional state across multiple messages, detecting escalation
 * patterns that a single-message detector would miss.
 *
 * If a user is getting progressively more frustrated over 4-5 messages,
 * the engine should amplify empathy before they reach a breaking point.
 */
export class EmotionalTracker {
    history = [];
    // ── Recording ───────────────────────────────────────────────────────────
    /** Record a detected emotion with its intensity and source message. */
    recordEmotion(emotion, intensity, message) {
        this.history.push({
            emotion,
            intensity: Math.min(Math.max(intensity, 0), 1),
            timestamp: Date.now(),
            message,
        });
    }
    // ── Effective emotion ──────────────────────────────────────────────────
    /**
     * Get the effective emotional state considering trajectory across the
     * conversation window.
     */
    getEffectiveEmotion() {
        if (this.history.length === 0) {
            return { emotion: 'neutral', intensity: 0, trajectory: 'stable', escalationAlert: false };
        }
        const latest = this.history[this.history.length - 1];
        if (this.history.length < 2) {
            return { emotion: latest.emotion, intensity: latest.intensity, trajectory: 'stable', escalationAlert: false };
        }
        // Sliding window: last WINDOW_SIZE entries
        const window = this.history.slice(-WINDOW_SIZE);
        // Predominant emotion (mode)
        const emotionCounts = new Map();
        let totalIntensity = 0;
        for (const entry of window) {
            emotionCounts.set(entry.emotion, (emotionCounts.get(entry.emotion) ?? 0) + 1);
            totalIntensity += entry.intensity;
        }
        const averageIntensity = totalIntensity / window.length;
        let predominant = 'neutral';
        let maxCount = 0;
        for (const [emotion, count] of emotionCounts) {
            if (count > maxCount) {
                maxCount = count;
                predominant = emotion;
            }
        }
        // Detect trajectory
        const trajectory = this.detectTrajectory(window);
        // Escalation alert
        const escalationAlert = trajectory === 'escalating' &&
            averageIntensity > ALERT_INTENSITY_THRESHOLD &&
            window.length >= ALERT_MIN_MESSAGES;
        return {
            emotion: predominant,
            intensity: averageIntensity,
            trajectory,
            escalationAlert,
        };
    }
    // ── Trajectory detection ───────────────────────────────────────────────
    detectTrajectory(window) {
        // Count distinct emotion changes
        let emotionChanges = 0;
        for (let i = 1; i < window.length; i++) {
            if (window[i].emotion !== window[i - 1].emotion) {
                emotionChanges++;
            }
        }
        // VOLATILE: 3+ emotion changes in window
        if (emotionChanges >= VOLATILE_CHANGE_THRESHOLD) {
            return 'volatile';
        }
        // ESCALATING: last 3+ messages show increasing intensity of negative emotions
        if (window.length >= ESCALATION_MIN_STREAK) {
            const tail = window.slice(-ESCALATION_MIN_STREAK);
            const allNegative = tail.every(e => NEGATIVE_EMOTIONS.has(e.emotion));
            if (allNegative) {
                let increasing = true;
                for (let i = 1; i < tail.length; i++) {
                    if (tail[i].intensity < tail[i - 1].intensity) {
                        increasing = false;
                        break;
                    }
                }
                if (increasing)
                    return 'escalating';
            }
        }
        // DE_ESCALATING: was negative, trending toward neutral/positive
        if (window.length >= 2) {
            const earlier = window.slice(0, Math.ceil(window.length / 2));
            const later = window.slice(Math.ceil(window.length / 2));
            const earlierNegativeRatio = earlier.filter(e => NEGATIVE_EMOTIONS.has(e.emotion)).length / earlier.length;
            const laterNegativeRatio = later.filter(e => NEGATIVE_EMOTIONS.has(e.emotion)).length / later.length;
            if (earlierNegativeRatio > 0.5 && laterNegativeRatio < earlierNegativeRatio) {
                return 'de_escalating';
            }
        }
        // SHIFTING: one distinct change (not same emotion throughout, not volatile)
        if (emotionChanges >= 1 && emotionChanges < VOLATILE_CHANGE_THRESHOLD) {
            // Only call it shifting if the latest emotion differs from the earlier predominant
            const earlierEmotions = window.slice(0, -1);
            const earlierMode = this.mode(earlierEmotions.map(e => e.emotion));
            if (window[window.length - 1].emotion !== earlierMode) {
                return 'shifting';
            }
        }
        // STABLE: same emotion for 3+ messages or no significant change
        return 'stable';
    }
    mode(values) {
        const counts = new Map();
        for (const v of values) {
            counts.set(v, (counts.get(v) ?? 0) + 1);
        }
        let best = 'neutral';
        let bestCount = 0;
        for (const [val, count] of counts) {
            if (count > bestCount) {
                bestCount = count;
                best = val;
            }
        }
        return best;
    }
    // ── Lifecycle ──────────────────────────────────────────────────────────
    /** Reset for a new conversation — clears all history. */
    reset() {
        this.history = [];
    }
}
//# sourceMappingURL=emotional-tracker.js.map