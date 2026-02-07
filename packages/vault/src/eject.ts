import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface EjectableData {
  version: number;
  exportedAt: string;
  credentials: Record<string, string>;
  metadata?: Record<string, unknown>;
}

/**
 * EjectManager provides data portability — export all tenant data
 * in a portable, decrypted format that can be imported elsewhere.
 */
export class EjectManager {
  /**
   * Export all credentials to a portable JSON format.
   */
  static exportData(credentials: Record<string, string>, metadata?: Record<string, unknown>): EjectableData {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      credentials: { ...credentials },
      metadata,
    };
  }

  /**
   * Save exported data to a file.
   */
  static async saveToFile(data: EjectableData, filePath: string): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * Load exported data from a file.
   */
  static async loadFromFile(filePath: string): Promise<EjectableData> {
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content) as EjectableData;
    if (!data.version || !data.credentials) {
      throw new Error('Invalid eject file format');
    }
    return data;
  }

  /**
   * Import credentials from ejected data into a vault-compatible format.
   */
  static getCredentials(data: EjectableData): Record<string, string> {
    return { ...data.credentials };
  }
}
