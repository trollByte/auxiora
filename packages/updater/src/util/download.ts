import * as fs from 'node:fs';
import * as path from 'node:path';
import { getLogger } from '@auxiora/logger';

const logger = getLogger('updater:download');

export async function downloadFile(url: string, destPath: string): Promise<string> {
  logger.info('Downloading', { url, destPath });

  const dir = path.dirname(destPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed: HTTP ${response.status} from ${url}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destPath, buffer);

  logger.info('Download complete', { destPath, bytes: buffer.length });
  return destPath;
}
