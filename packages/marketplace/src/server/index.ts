import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { RegistryDatabase } from './db.js';
import { PackageStorage } from './storage.js';
import { pluginRoutes } from './routes/plugins.js';
import { personalityRoutes } from './routes/personalities.js';

export interface RegistryServerConfig {
  dataDir: string;
  port: number;
  host?: string;
  apiKeys: string[];
}

export async function createRegistryServer(config: RegistryServerConfig): Promise<FastifyInstance> {
  fs.mkdirSync(config.dataDir, { recursive: true });

  const db = new RegistryDatabase(path.join(config.dataDir, 'registry.db'));
  const storage = new PackageStorage(path.join(config.dataDir, 'packages'));

  const app = Fastify({ logger: false });

  // Health check endpoint
  app.get('/api/v1/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  // Register route modules
  await app.register(pluginRoutes, { db, storage, apiKeys: config.apiKeys });
  await app.register(personalityRoutes, { db, storage, apiKeys: config.apiKeys });

  // Clean up database on server close
  app.addHook('onClose', () => {
    db.close();
  });

  await app.ready();
  return app;
}
