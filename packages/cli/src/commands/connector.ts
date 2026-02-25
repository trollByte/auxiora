import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/** Capitalize the first letter of a string. */
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Convert a kebab-case name to PascalCase.
 * e.g. "my-service" → "MyService"
 */
function toPascalCase(name: string): string {
  return name.split('-').map(capitalize).join('');
}

/**
 * Convert a kebab-case name to camelCase.
 * e.g. "my-service" → "myService"
 */
function toCamelCase(name: string): string {
  const pascal = toPascalCase(name);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/**
 * Scaffold a new connector package with all boilerplate files.
 *
 * Creates `connector-{name}/` under `targetDir` with:
 * - package.json
 * - tsconfig.json
 * - src/connector.ts
 * - src/index.ts
 * - tests/connector.test.ts
 */
export async function scaffoldConnector(name: string, targetDir: string): Promise<void> {
  const pascalName = toPascalCase(name);
  const camelName = toCamelCase(name);
  const connectorVar = `${camelName}Connector`;

  const baseDir = path.join(targetDir, `connector-${name}`);
  const srcDir = path.join(baseDir, 'src');
  const testsDir = path.join(baseDir, 'tests');

  await fs.mkdir(srcDir, { recursive: true });
  await fs.mkdir(testsDir, { recursive: true });

  // package.json
  const packageJson = {
    name: `@auxiora/connector-${name}`,
    version: '1.0.0',
    description: `${pascalName} connector for Auxiora`,
    type: 'module',
    main: 'dist/index.js',
    types: 'dist/index.d.ts',
    exports: {
      '.': {
        types: './dist/index.d.ts',
        import: './dist/index.js',
      },
    },
    scripts: {
      build: 'tsc',
      clean: 'rm -rf dist',
      typecheck: 'tsc --noEmit',
    },
    dependencies: {
      '@auxiora/connectors': 'workspace:*',
    },
    engines: {
      node: '>=22.0.0',
    },
  };

  // tsconfig.json
  const tsconfig = {
    extends: '../../tsconfig.base.json',
    compilerOptions: {
      outDir: './dist',
      rootDir: './src',
    },
    include: ['src/**/*'],
    references: [
      { path: '../connectors' },
    ],
  };

  // src/connector.ts
  const connectorSrc = `import { defineConnector } from '@auxiora/connectors';
import type { TriggerEvent } from '@auxiora/connectors';

const API_BASE = 'https://api.example.com';

export const ${connectorVar} = defineConnector({
  id: '${name}',
  name: '${pascalName}',
  description: '${pascalName} connector for Auxiora',
  version: '1.0.0',
  category: 'general',
  auth: {
    type: 'api_key',
    instructions: 'Enter your ${pascalName} API key.',
  },
  actions: [
    {
      id: 'example-action',
      name: 'Example Action',
      description: 'An example action',
      trustMinimum: 1,
      trustDomain: 'integrations',
      reversible: false,
      sideEffects: false,
      params: {},
    },
  ],
  triggers: [],
  entities: [],
  async executeAction(actionId: string, params: Record<string, unknown>, token: string): Promise<unknown> {
    switch (actionId) {
      case 'example-action':
        return { status: 'ok' };
      default:
        throw new Error(\`Unknown action: \${actionId}\`);
    }
  },
});
`;

  // src/index.ts
  const indexSrc = `export { ${connectorVar} } from './connector.js';
`;

  // tests/connector.test.ts
  const testSrc = `import { describe, it, expect } from 'vitest';
import { ${connectorVar} } from '../src/connector.js';

describe('${connectorVar}', () => {
  it('should have correct id and name', () => {
    expect(${connectorVar}.id).toBe('${name}');
    expect(${connectorVar}.name).toBe('${pascalName}');
  });

  it('should have at least one action', () => {
    expect(${connectorVar}.actions.length).toBeGreaterThan(0);
  });
});
`;

  await Promise.all([
    fs.writeFile(path.join(baseDir, 'package.json'), JSON.stringify(packageJson, null, 2) + '\n'),
    fs.writeFile(path.join(baseDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2) + '\n'),
    fs.writeFile(path.join(srcDir, 'connector.ts'), connectorSrc),
    fs.writeFile(path.join(srcDir, 'index.ts'), indexSrc),
    fs.writeFile(path.join(testsDir, 'connector.test.ts'), testSrc),
  ]);
}
