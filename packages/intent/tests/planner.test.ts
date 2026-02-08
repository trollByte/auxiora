import { describe, it, expect } from 'vitest';
import { IntentParser } from '../src/parser.js';
import { ActionPlanner } from '../src/planner.js';

describe('ActionPlanner', () => {
  const parser = new IntentParser();
  const planner = new ActionPlanner();

  it('should plan send_message action', () => {
    const intent = parser.parse('Send a message to @john');
    const steps = planner.planActions(intent);
    expect(steps).toHaveLength(1);
    expect(steps[0].action).toBe('send_message');
    expect(steps[0].domain).toBe('messaging');
  });

  it('should plan edit_file with two steps (read then edit)', () => {
    const intent = parser.parse('Edit the file /tmp/test.txt');
    const steps = planner.planActions(intent);
    expect(steps).toHaveLength(2);
    expect(steps[0].action).toBe('read_file');
    expect(steps[1].action).toBe('edit_file');
    expect(steps[1].dependsOn).toContain(steps[0].id);
  });

  it('should plan browse_web action with URL', () => {
    const intent = parser.parse('Navigate to https://example.com');
    const steps = planner.planActions(intent);
    expect(steps).toHaveLength(1);
    expect(steps[0].action).toBe('navigate');
    expect(steps[0].domain).toBe('web');
    expect(steps[0].params.url).toBe('https://example.com');
  });

  it('should plan schedule action', () => {
    const intent = parser.parse('Schedule a meeting for tomorrow at 3:00 pm');
    const steps = planner.planActions(intent);
    expect(steps).toHaveLength(1);
    expect(steps[0].action).toBe('create_event');
    expect(steps[0].domain).toBe('calendar');
  });

  it('should plan delete_file action', () => {
    const intent = parser.parse('Delete /tmp/test.txt');
    const steps = planner.planActions(intent);
    expect(steps).toHaveLength(1);
    expect(steps[0].action).toBe('delete_file');
    expect(steps[0].params.path).toBe('/tmp/test.txt');
  });

  it('should plan search action', () => {
    const intent = parser.parse('Search for TypeScript tutorials');
    const steps = planner.planActions(intent);
    expect(steps).toHaveLength(1);
    expect(steps[0].action).toBe('web_search');
    expect(steps[0].domain).toBe('web');
  });

  it('should plan remind action', () => {
    const intent = parser.parse('Remind me tomorrow to call the doctor');
    const steps = planner.planActions(intent);
    expect(steps).toHaveLength(1);
    expect(steps[0].action).toBe('create_reminder');
    expect(steps[0].domain).toBe('calendar');
  });

  it('should plan summarize action', () => {
    const intent = parser.parse('Summarize the article');
    const steps = planner.planActions(intent);
    expect(steps).toHaveLength(1);
    expect(steps[0].action).toBe('summarize');
  });

  it('should assign unique IDs to steps', () => {
    const intent = parser.parse('Edit the file /tmp/test.txt');
    const steps = planner.planActions(intent);
    const ids = new Set(steps.map((s) => s.id));
    expect(ids.size).toBe(steps.length);
  });

  it('should handle unknown intent', () => {
    const intent = parser.parse('hello');
    const steps = planner.planActions(intent);
    expect(steps).toHaveLength(1);
    expect(steps[0].action).toBe('unknown');
  });
});
