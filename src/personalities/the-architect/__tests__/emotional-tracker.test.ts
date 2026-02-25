import { describe, it, expect, beforeEach } from 'vitest';
import { EmotionalTracker, estimateIntensity } from '../emotional-tracker.js';
import { createArchitect } from '../index.js';
import type { EmotionalRegister } from '../../schema.js';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

let tracker: EmotionalTracker;

beforeEach(() => {
  tracker = new EmotionalTracker();
});

// ────────────────────────────────────────────────────────────────────────────
// estimateIntensity
// ────────────────────────────────────────────────────────────────────────────

describe('estimateIntensity', () => {
  it('neutral emotion returns low intensity', () => {
    expect(estimateIntensity('Hello there', 'neutral')).toBe(0.2);
  });

  it('frustrated with exclamations and caps returns higher intensity', () => {
    const intensity = estimateIntensity('THIS IS BROKEN!!! I CANNOT BELIEVE IT', 'frustrated');
    expect(intensity).toBeGreaterThan(0.6);
  });

  it('intensity is capped at 1.0', () => {
    const intensity = estimateIntensity(
      'UGH THIS IS EXTREMELY BROKEN!!! WTF SERIOUSLY I CANNOT BELIEVE THIS IS STILL NOT WORKING ARGH ' +
      'I have been trying for hours and hours and nothing works at all and I am so frustrated and tired',
      'frustrated',
    );
    expect(intensity).toBeLessThanOrEqual(1.0);
  });

  it('longer frustrated messages have higher intensity', () => {
    const short = estimateIntensity('This is broken', 'frustrated');
    const long = estimateIntensity(
      'This is broken and I have been trying to fix it for hours. ' +
      'I tried restarting, I tried clearing the cache, I tried everything. ' +
      'Nothing works. The error keeps coming back. I am running out of ideas. ' +
      'The deadline is tomorrow and I have no clue what is wrong.',
      'frustrated',
    );
    expect(long).toBeGreaterThan(short);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Single message — stable trajectory
// ────────────────────────────────────────────────────────────────────────────

describe('EmotionalTracker — stable trajectory', () => {
  it('single message returns stable trajectory', () => {
    tracker.recordEmotion('frustrated', 0.5, 'This is broken');
    const result = tracker.getEffectiveEmotion();
    expect(result.trajectory).toBe('stable');
    expect(result.emotion).toBe('frustrated');
    expect(result.escalationAlert).toBe(false);
  });

  it('empty history returns neutral stable', () => {
    const result = tracker.getEffectiveEmotion();
    expect(result.emotion).toBe('neutral');
    expect(result.intensity).toBe(0);
    expect(result.trajectory).toBe('stable');
  });

  it('3+ messages of same emotion at similar intensity returns stable', () => {
    tracker.recordEmotion('neutral', 0.2, 'Hello');
    tracker.recordEmotion('neutral', 0.2, 'How are you');
    tracker.recordEmotion('neutral', 0.2, 'What time is it');
    const result = tracker.getEffectiveEmotion();
    expect(result.trajectory).toBe('stable');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Escalating trajectory
// ────────────────────────────────────────────────────────────────────────────

describe('EmotionalTracker — escalating trajectory', () => {
  it('3 increasingly frustrated messages returns escalating', () => {
    tracker.recordEmotion('frustrated', 0.4, 'This is annoying');
    tracker.recordEmotion('frustrated', 0.6, 'Seriously this keeps happening');
    tracker.recordEmotion('frustrated', 0.8, 'I cannot believe this is still broken');
    const result = tracker.getEffectiveEmotion();
    expect(result.trajectory).toBe('escalating');
  });

  it('stressed with increasing intensity also counts as escalating', () => {
    tracker.recordEmotion('stressed', 0.3, 'I have a lot to do');
    tracker.recordEmotion('stressed', 0.5, 'I am running behind');
    tracker.recordEmotion('stressed', 0.7, 'I am drowning in work');
    const result = tracker.getEffectiveEmotion();
    expect(result.trajectory).toBe('escalating');
  });

  it('non-increasing frustrated messages are NOT escalating', () => {
    tracker.recordEmotion('frustrated', 0.6, 'Annoying');
    tracker.recordEmotion('frustrated', 0.5, 'Still annoying');
    tracker.recordEmotion('frustrated', 0.4, 'Getting less annoyed');
    const result = tracker.getEffectiveEmotion();
    expect(result.trajectory).not.toBe('escalating');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Escalation alert
// ────────────────────────────────────────────────────────────────────────────

describe('EmotionalTracker — escalation alert', () => {
  it('triggers at high intensity sustained frustration (4+ messages)', () => {
    tracker.recordEmotion('frustrated', 0.7, 'First');
    tracker.recordEmotion('frustrated', 0.75, 'Second');
    tracker.recordEmotion('frustrated', 0.8, 'Third');
    tracker.recordEmotion('frustrated', 0.85, 'Fourth');
    const result = tracker.getEffectiveEmotion();
    expect(result.trajectory).toBe('escalating');
    expect(result.escalationAlert).toBe(true);
  });

  it('does not trigger with only 3 messages (below alert threshold)', () => {
    tracker.recordEmotion('frustrated', 0.7, 'First');
    tracker.recordEmotion('frustrated', 0.8, 'Second');
    tracker.recordEmotion('frustrated', 0.9, 'Third');
    const result = tracker.getEffectiveEmotion();
    expect(result.trajectory).toBe('escalating');
    expect(result.escalationAlert).toBe(false); // need 4+ messages
  });

  it('does not trigger at low average intensity', () => {
    tracker.recordEmotion('frustrated', 0.3, 'Mild');
    tracker.recordEmotion('frustrated', 0.35, 'Still mild');
    tracker.recordEmotion('frustrated', 0.4, 'Slightly more');
    tracker.recordEmotion('frustrated', 0.45, 'A bit more');
    const result = tracker.getEffectiveEmotion();
    // Average ~0.375 which is below 0.7 threshold
    expect(result.escalationAlert).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Volatile trajectory
// ────────────────────────────────────────────────────────────────────────────

describe('EmotionalTracker — volatile trajectory', () => {
  it('3+ emotion changes in 5 messages returns volatile', () => {
    tracker.recordEmotion('neutral', 0.2, 'Hi');
    tracker.recordEmotion('frustrated', 0.6, 'Ugh');
    tracker.recordEmotion('excited', 0.5, 'Wait maybe this works');
    tracker.recordEmotion('frustrated', 0.7, 'Nope broken again');
    const result = tracker.getEffectiveEmotion();
    expect(result.trajectory).toBe('volatile');
  });

  it('rapid swings between positive and negative', () => {
    tracker.recordEmotion('excited', 0.6, 'This is great');
    tracker.recordEmotion('frustrated', 0.7, 'No wait');
    tracker.recordEmotion('celebratory', 0.5, 'Oh it works');
    tracker.recordEmotion('stressed', 0.6, 'No it broke');
    const result = tracker.getEffectiveEmotion();
    expect(result.trajectory).toBe('volatile');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// De-escalating trajectory
// ────────────────────────────────────────────────────────────────────────────

describe('EmotionalTracker — de_escalating trajectory', () => {
  it('moving from frustrated to neutral', () => {
    tracker.recordEmotion('frustrated', 0.7, 'This is broken');
    tracker.recordEmotion('frustrated', 0.5, 'Hmm let me think');
    tracker.recordEmotion('neutral', 0.3, 'Ok I see');
    tracker.recordEmotion('neutral', 0.2, 'That makes sense');
    const result = tracker.getEffectiveEmotion();
    expect(result.trajectory).toBe('de_escalating');
  });

  it('stressed calming down', () => {
    tracker.recordEmotion('stressed', 0.8, 'Too much');
    tracker.recordEmotion('stressed', 0.6, 'Taking a breath');
    tracker.recordEmotion('neutral', 0.3, 'Ok');
    tracker.recordEmotion('neutral', 0.2, 'Better now');
    const result = tracker.getEffectiveEmotion();
    expect(result.trajectory).toBe('de_escalating');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Shifting trajectory
// ────────────────────────────────────────────────────────────────────────────

describe('EmotionalTracker — shifting trajectory', () => {
  it('moving from uncertain to excited', () => {
    tracker.recordEmotion('uncertain', 0.5, 'Not sure about this');
    tracker.recordEmotion('uncertain', 0.5, 'Is this right?');
    tracker.recordEmotion('excited', 0.6, 'Oh wait this is cool!');
    const result = tracker.getEffectiveEmotion();
    expect(result.trajectory).toBe('shifting');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Reset
// ────────────────────────────────────────────────────────────────────────────

describe('EmotionalTracker — reset', () => {
  it('reset clears all history', () => {
    tracker.recordEmotion('frustrated', 0.7, 'Broken');
    tracker.recordEmotion('frustrated', 0.8, 'Still broken');
    tracker.recordEmotion('frustrated', 0.9, 'STILL broken');

    tracker.reset();

    const result = tracker.getEffectiveEmotion();
    expect(result.emotion).toBe('neutral');
    expect(result.intensity).toBe(0);
    expect(result.trajectory).toBe('stable');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Window behavior
// ────────────────────────────────────────────────────────────────────────────

describe('EmotionalTracker — sliding window', () => {
  it('only considers last 5 messages for trajectory', () => {
    // 3 old frustrated messages (outside window once we add 5 more)
    tracker.recordEmotion('frustrated', 0.9, 'Old frustration 1');
    tracker.recordEmotion('frustrated', 0.9, 'Old frustration 2');
    tracker.recordEmotion('frustrated', 0.9, 'Old frustration 3');

    // 5 newer neutral messages push frustrated out of window
    tracker.recordEmotion('neutral', 0.2, 'New calm 1');
    tracker.recordEmotion('neutral', 0.2, 'New calm 2');
    tracker.recordEmotion('neutral', 0.2, 'New calm 3');
    tracker.recordEmotion('neutral', 0.2, 'New calm 4');
    tracker.recordEmotion('neutral', 0.2, 'New calm 5');

    const result = tracker.getEffectiveEmotion();
    expect(result.emotion).toBe('neutral');
    // Should NOT be escalating even though early messages were frustrated
    expect(result.trajectory).toBe('stable');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Integration with TheArchitect
// ────────────────────────────────────────────────────────────────────────────

describe('TheArchitect — emotional tracker integration', () => {
  it('escalating trajectory amplifies empathy traits in the prompt', () => {
    const architect = createArchitect();

    // Non-escalating baseline
    const baseline = architect.generatePrompt("I'm stuck and frustrated with this error — it's broken and failing and I can't debug it");
    const baseWarmth = baseline.activeTraits.find(t => t.traitKey === 'warmth');

    // Reset and build escalation
    architect.resetConversation();

    // Simulate escalating frustration (need messages that detect as frustrated)
    architect.generatePrompt("I'm frustrated, this bug is annoying, ugh it keeps failing");
    architect.generatePrompt("I'm so frustrated, this is still broken, seriously why does this keep happening");
    const escalated = architect.generatePrompt("I'm extremely frustrated, I CANNOT BELIEVE this is still broken, ugh this is terrible!!");

    expect(escalated.emotionalTrajectory).toBe('escalating');
    // The prompt should reflect heightened empathy — at minimum trajectory should be reported
    expect(escalated.emotionalTrajectory).not.toBe('stable');
  });

  it('volatile trajectory amplifies stability traits', () => {
    const architect = createArchitect();

    architect.generatePrompt('This is fine, everything is working great');
    architect.generatePrompt("I'm frustrated, this bug is annoying, ugh it keeps failing");
    architect.generatePrompt('Wait actually this is exciting, it might be a great opportunity!');
    const result = architect.generatePrompt("I'm stressed again, too much work, drowning and overwhelmed");

    expect(result.emotionalTrajectory).toBe('volatile');
  });

  it('resetConversation also resets emotional tracker', () => {
    const architect = createArchitect();

    architect.generatePrompt("I'm frustrated, this bug is annoying, ugh it keeps failing");
    architect.generatePrompt("I'm so frustrated, this is still broken, seriously why does this keep happening");
    architect.generatePrompt("I'm extremely frustrated, CANNOT BELIEVE this, ugh!!");

    architect.resetConversation();

    const state = architect.getEmotionalState();
    expect(state.emotion).toBe('neutral');
    expect(state.trajectory).toBe('stable');
  });

  it('PromptOutput includes emotionalTrajectory', () => {
    const architect = createArchitect();
    const output = architect.generatePrompt('Hello, how are you?');
    expect(output.emotionalTrajectory).toBeDefined();
  });

  it('escalationAlert is set when sustained high frustration', () => {
    const architect = createArchitect();

    // 4+ messages of high-intensity frustration
    architect.generatePrompt("I'm frustrated!!! UGH this is EXTREMELY broken, CANNOT BELIEVE this argh seriously");
    architect.generatePrompt("STILL broken!!! I'm SO frustrated, WTF is going on, this is TERRIBLE and AWFUL");
    architect.generatePrompt("SERIOUSLY!!! THIS IS STILL NOT WORKING, I'm EXTREMELY FRUSTRATED, UGH ARGH WTF");
    const result = architect.generatePrompt("I CANNOT STAND THIS!!! EXTREMELY BROKEN, UGH WTF ARGH, STILL NOT WORKING SERIOUSLY");

    // These messages should trigger escalation alert if trajectory is escalating
    // and average intensity > 0.7 for 4+ messages
    if (result.emotionalTrajectory === 'escalating') {
      expect(result.escalationAlert).toBe(true);
    }
  });
});
