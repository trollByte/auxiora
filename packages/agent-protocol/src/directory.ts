import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getLogger } from '@auxiora/logger';
import { getAuxioraDir } from '@auxiora/core';
import type { AgentIdentifier, AgentDirectoryEntry, AgentCapability } from './types.js';
import { formatAgentId } from './types.js';

const logger = getLogger('agent-protocol:directory');

/**
 * Directory of known agents for discovery and lookup.
 */
export class AgentDirectory {
  private filePath: string;

  constructor(options?: { dir?: string }) {
    const dir = options?.dir ?? path.join(getAuxioraDir(), 'agent-protocol');
    this.filePath = path.join(dir, 'directory.json');
  }

  async register(
    identifier: AgentIdentifier,
    displayName: string,
    publicKey: string,
    endpoint: string,
    capabilities?: AgentCapability[],
  ): Promise<AgentDirectoryEntry> {
    const entries = await this.readFile();
    const uri = formatAgentId(identifier);

    // Update if already registered
    const existing = entries.find(e => formatAgentId(e.identifier) === uri);
    if (existing) {
      existing.displayName = displayName;
      existing.publicKey = publicKey;
      existing.endpoint = endpoint;
      existing.capabilities = capabilities ?? existing.capabilities;
      existing.lastSeen = Date.now();
      await this.writeFile(entries);
      logger.debug('Updated agent registration', { uri });
      return existing;
    }

    const entry: AgentDirectoryEntry = {
      identifier,
      displayName,
      capabilities: capabilities ?? [],
      publicKey,
      endpoint,
      lastSeen: Date.now(),
      registeredAt: Date.now(),
    };

    entries.push(entry);
    await this.writeFile(entries);
    logger.debug('Registered agent', { uri });
    return entry;
  }

  async lookup(identifier: AgentIdentifier): Promise<AgentDirectoryEntry | undefined> {
    const entries = await this.readFile();
    const uri = formatAgentId(identifier);
    return entries.find(e => formatAgentId(e.identifier) === uri);
  }

  async search(query: string): Promise<AgentDirectoryEntry[]> {
    const entries = await this.readFile();
    const lowerQuery = query.toLowerCase();

    return entries.filter(e =>
      e.displayName.toLowerCase().includes(lowerQuery) ||
      formatAgentId(e.identifier).toLowerCase().includes(lowerQuery) ||
      e.capabilities.some(c =>
        c.name.toLowerCase().includes(lowerQuery) ||
        c.description.toLowerCase().includes(lowerQuery),
      ),
    );
  }

  async remove(identifier: AgentIdentifier): Promise<boolean> {
    const entries = await this.readFile();
    const uri = formatAgentId(identifier);
    const filtered = entries.filter(e => formatAgentId(e.identifier) !== uri);
    if (filtered.length === entries.length) return false;

    await this.writeFile(filtered);
    logger.debug('Removed agent', { uri });
    return true;
  }

  async listAll(): Promise<AgentDirectoryEntry[]> {
    return this.readFile();
  }

  private async readFile(): Promise<AgentDirectoryEntry[]> {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(content) as AgentDirectoryEntry[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  private async writeFile(entries: AgentDirectoryEntry[]): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(entries, null, 2), 'utf-8');
  }
}
