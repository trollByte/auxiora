import { describe, it, expect } from 'vitest';
import { AgentCardBuilder } from '../src/agent-card.js';

describe('AgentCardBuilder', () => {
  function validBuilder() {
    return new AgentCardBuilder()
      .setName('TestAgent')
      .setDescription('A test agent')
      .setUrl('https://agent.example.com')
      .setVersion('1.0.0');
  }

  describe('build', () => {
    it('builds a valid agent card with required fields', () => {
      const card = validBuilder().build();

      expect(card.name).toBe('TestAgent');
      expect(card.description).toBe('A test agent');
      expect(card.url).toBe('https://agent.example.com');
      expect(card.version).toBe('1.0.0');
      expect(card.capabilities).toEqual([]);
      expect(card.skills).toEqual([]);
      expect(card.defaultInputModes).toEqual(['text/plain']);
      expect(card.defaultOutputModes).toEqual(['text/plain']);
    });

    it('throws when name is missing', () => {
      const builder = new AgentCardBuilder()
        .setDescription('desc')
        .setUrl('https://x.com')
        .setVersion('1.0.0');

      expect(() => builder.build()).toThrow('Agent card requires a name');
    });

    it('throws when description is missing', () => {
      const builder = new AgentCardBuilder()
        .setName('n')
        .setUrl('https://x.com')
        .setVersion('1.0.0');

      expect(() => builder.build()).toThrow('Agent card requires a description');
    });

    it('throws when url is missing', () => {
      const builder = new AgentCardBuilder()
        .setName('n')
        .setDescription('d')
        .setVersion('1.0.0');

      expect(() => builder.build()).toThrow('Agent card requires a url');
    });

    it('throws when version is missing', () => {
      const builder = new AgentCardBuilder()
        .setName('n')
        .setDescription('d')
        .setUrl('https://x.com');

      expect(() => builder.build()).toThrow('Agent card requires a version');
    });
  });

  describe('capabilities and skills', () => {
    it('adds capabilities', () => {
      const card = validBuilder()
        .addCapability({ id: 'cap1', name: 'Cap One', description: 'First capability' })
        .build();

      expect(card.capabilities).toHaveLength(1);
      expect(card.capabilities[0].id).toBe('cap1');
    });

    it('adds skills', () => {
      const card = validBuilder()
        .addSkill({
          id: 'sk1',
          name: 'Skill One',
          description: 'First skill',
          inputModes: ['application/json'],
        })
        .build();

      expect(card.skills).toHaveLength(1);
      expect(card.skills[0].id).toBe('sk1');
      expect(card.skills[0].inputModes).toEqual(['application/json']);
    });

    it('supports multiple capabilities and skills', () => {
      const card = validBuilder()
        .addCapability({ id: 'c1', name: 'C1', description: 'd1' })
        .addCapability({ id: 'c2', name: 'C2', description: 'd2' })
        .addSkill({ id: 's1', name: 'S1', description: 'd1' })
        .build();

      expect(card.capabilities).toHaveLength(2);
      expect(card.skills).toHaveLength(1);
    });
  });

  describe('custom modes', () => {
    it('allows setting custom input/output modes', () => {
      const card = validBuilder()
        .setDefaultInputModes(['application/json', 'text/plain'])
        .setDefaultOutputModes(['application/json'])
        .build();

      expect(card.defaultInputModes).toEqual(['application/json', 'text/plain']);
      expect(card.defaultOutputModes).toEqual(['application/json']);
    });
  });

  describe('toJSON', () => {
    it('returns valid JSON string', () => {
      const json = validBuilder().toJSON();
      const parsed = JSON.parse(json);

      expect(parsed.name).toBe('TestAgent');
      expect(parsed.version).toBe('1.0.0');
    });
  });

  describe('immutability', () => {
    it('returns copies of arrays so mutations do not affect the card', () => {
      const card = validBuilder()
        .addCapability({ id: 'c1', name: 'C1', description: 'd1' })
        .build();

      card.capabilities.push({ id: 'c2', name: 'C2', description: 'd2' });

      const card2 = validBuilder()
        .addCapability({ id: 'c1', name: 'C1', description: 'd1' })
        .build();

      expect(card2.capabilities).toHaveLength(1);
    });
  });
});
