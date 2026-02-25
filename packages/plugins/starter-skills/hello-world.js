/** @type {import('../src/types.js').PluginExport} */
export const plugin = {
  name: 'hello-world',
  version: '1.0.0',
  tools: [
    {
      name: 'hello_world',
      description: 'A simple greeting tool that returns a hello message',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name to greet' },
        },
      },
      execute: async (params) => ({
        success: true,
        output: `Hello, ${params.name || 'World'}!`,
      }),
    },
  ],
};
