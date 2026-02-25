import { AuxioraError, ErrorCode } from '@auxiora/errors';
import type { AgentCard, AgentCapability, AgentSkill } from './types.js';

export class AgentCardBuilder {
  private name?: string;
  private description?: string;
  private url?: string;
  private version?: string;
  private capabilities: AgentCapability[] = [];
  private skills: AgentSkill[] = [];
  private defaultInputModes: string[] = ['text/plain'];
  private defaultOutputModes: string[] = ['text/plain'];

  setName(name: string): this {
    this.name = name;
    return this;
  }

  setDescription(description: string): this {
    this.description = description;
    return this;
  }

  setUrl(url: string): this {
    this.url = url;
    return this;
  }

  setVersion(version: string): this {
    this.version = version;
    return this;
  }

  addCapability(capability: AgentCapability): this {
    this.capabilities.push(capability);
    return this;
  }

  addSkill(skill: AgentSkill): this {
    this.skills.push(skill);
    return this;
  }

  setDefaultInputModes(modes: string[]): this {
    this.defaultInputModes = modes;
    return this;
  }

  setDefaultOutputModes(modes: string[]): this {
    this.defaultOutputModes = modes;
    return this;
  }

  build(): AgentCard {
    if (!this.name) {
      throw new AuxioraError({
        code: ErrorCode.INVALID_INPUT,
        message: 'Agent card requires a name',
        retryable: false,
      });
    }
    if (!this.description) {
      throw new AuxioraError({
        code: ErrorCode.INVALID_INPUT,
        message: 'Agent card requires a description',
        retryable: false,
      });
    }
    if (!this.url) {
      throw new AuxioraError({
        code: ErrorCode.INVALID_INPUT,
        message: 'Agent card requires a url',
        retryable: false,
      });
    }
    if (!this.version) {
      throw new AuxioraError({
        code: ErrorCode.INVALID_INPUT,
        message: 'Agent card requires a version',
        retryable: false,
      });
    }

    return {
      name: this.name,
      description: this.description,
      url: this.url,
      version: this.version,
      capabilities: [...this.capabilities],
      skills: [...this.skills],
      defaultInputModes: [...this.defaultInputModes],
      defaultOutputModes: [...this.defaultOutputModes],
    };
  }

  toJSON(): string {
    return JSON.stringify(this.build(), null, 2);
  }
}
