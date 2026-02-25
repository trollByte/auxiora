import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { scaffoldConnector } from '../src/commands/connector.js';

let testDir: string;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auxiora-scaffold-'));
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe('scaffoldConnector', () => {
  it('should create connector package structure', async () => {
    await scaffoldConnector('weather', testDir);

    const base = path.join(testDir, 'connector-weather');
    expect(fs.existsSync(path.join(base, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(base, 'src', 'connector.ts'))).toBe(true);
    expect(fs.existsSync(path.join(base, 'tests', 'connector.test.ts'))).toBe(true);
    expect(fs.existsSync(path.join(base, 'tsconfig.json'))).toBe(true);
  });

  it('should include correct connector id in generated code', async () => {
    await scaffoldConnector('weather', testDir);

    const src = fs.readFileSync(
      path.join(testDir, 'connector-weather', 'src', 'connector.ts'), 'utf-8'
    );
    expect(src).toContain("id: 'weather'");
    expect(src).toContain("name: 'Weather'");
    expect(src).toContain('defineConnector');
  });

  it('should generate valid package.json with correct name', async () => {
    await scaffoldConnector('weather', testDir);

    const pkg = JSON.parse(
      fs.readFileSync(
        path.join(testDir, 'connector-weather', 'package.json'), 'utf-8'
      )
    );
    expect(pkg.name).toBe('@auxiora/connector-weather');
    expect(pkg.type).toBe('module');
    expect(pkg.dependencies).toHaveProperty('@auxiora/connectors');
  });

  it('should generate barrel export in index.ts', async () => {
    await scaffoldConnector('weather', testDir);

    const index = fs.readFileSync(
      path.join(testDir, 'connector-weather', 'src', 'index.ts'), 'utf-8'
    );
    expect(index).toContain('weatherConnector');
    expect(index).toContain('./connector.js');
  });

  it('should generate test file referencing the connector', async () => {
    await scaffoldConnector('weather', testDir);

    const test = fs.readFileSync(
      path.join(testDir, 'connector-weather', 'tests', 'connector.test.ts'), 'utf-8'
    );
    expect(test).toContain('weatherConnector');
    expect(test).toContain("'weather'");
    expect(test).toContain("'Weather'");
  });

  it('should handle multi-word names', async () => {
    await scaffoldConnector('my-service', testDir);

    const base = path.join(testDir, 'connector-my-service');
    expect(fs.existsSync(path.join(base, 'package.json'))).toBe(true);

    const src = fs.readFileSync(
      path.join(base, 'src', 'connector.ts'), 'utf-8'
    );
    expect(src).toContain("id: 'my-service'");
    expect(src).toContain("name: 'MyService'");
    expect(src).toContain('myServiceConnector');
  });
});
