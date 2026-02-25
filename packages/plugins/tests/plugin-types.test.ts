import { describe, it, expect } from 'vitest';
import type {
  CommandDefinition,
  RouteDefinition,
  WidgetDefinition,
  ChannelDefinition,
  PluginManifest,
  PluginContext,
} from '../src/types.js';

describe('Plugin type definitions', () => {
  describe('CommandDefinition', () => {
    it('should create a valid command definition', () => {
      const command: CommandDefinition = {
        name: 'greet',
        description: 'Greet the user',
        arguments: [
          { name: 'name', description: 'Name to greet', required: true },
        ],
        options: [
          { flags: '-l, --loud', description: 'Use uppercase', default: 'false' },
        ],
        execute: async (args, options) => {
          const name = args.name ?? 'world';
          const greeting = `Hello, ${name}!`;
          return options.loud === 'true' ? greeting.toUpperCase() : greeting;
        },
      };

      expect(command.name).toBe('greet');
      expect(command.arguments).toHaveLength(1);
      expect(command.options).toHaveLength(1);
    });

    it('should execute a command', async () => {
      const command: CommandDefinition = {
        name: 'echo',
        description: 'Echo input',
        execute: async (args) => args.text ?? '',
      };

      const result = await command.execute({ text: 'hello' }, {});
      expect(result).toBe('hello');
    });
  });

  describe('RouteDefinition', () => {
    it('should create a valid route definition', () => {
      const route: RouteDefinition = {
        method: 'GET',
        path: '/api/custom/status',
        description: 'Get custom status',
        handler: async (req) => ({
          status: 200,
          body: { ok: true, query: req.query },
        }),
      };

      expect(route.method).toBe('GET');
      expect(route.path).toBe('/api/custom/status');
    });

    it('should handle a POST route', async () => {
      const route: RouteDefinition = {
        method: 'POST',
        path: '/api/custom/echo',
        description: 'Echo request body',
        handler: async (req) => ({
          status: 200,
          body: req.body,
          headers: { 'X-Custom': 'test' },
        }),
      };

      const result = await route.handler({
        params: {},
        query: {},
        body: { message: 'hello' },
        headers: {},
      });

      expect(result.status).toBe(200);
      expect(result.body).toEqual({ message: 'hello' });
      expect(result.headers?.['X-Custom']).toBe('test');
    });

    it('should support all HTTP methods', () => {
      const methods: RouteDefinition['method'][] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
      for (const method of methods) {
        const route: RouteDefinition = {
          method,
          path: '/test',
          description: `${method} route`,
          handler: async () => ({ status: 200, body: null }),
        };
        expect(route.method).toBe(method);
      }
    });
  });

  describe('WidgetDefinition', () => {
    it('should create a valid widget definition', () => {
      const widget: WidgetDefinition = {
        id: 'cpu-usage',
        name: 'CPU Usage',
        description: 'Shows current CPU usage',
        type: 'chart',
        size: 'medium',
        getData: async () => ({ usage: 45, cores: 8 }),
        refreshInterval: 5000,
      };

      expect(widget.id).toBe('cpu-usage');
      expect(widget.type).toBe('chart');
      expect(widget.size).toBe('medium');
      expect(widget.refreshInterval).toBe(5000);
    });

    it('should return data from getData', async () => {
      const widget: WidgetDefinition = {
        id: 'stats',
        name: 'Stats',
        description: 'Basic stats',
        type: 'stat',
        size: 'small',
        getData: async () => ({ count: 42 }),
      };

      const data = await widget.getData();
      expect(data).toEqual({ count: 42 });
    });

    it('should support all widget types', () => {
      const types: WidgetDefinition['type'][] = ['chart', 'table', 'stat', 'log', 'custom'];
      for (const type of types) {
        const widget: WidgetDefinition = {
          id: `widget-${type}`,
          name: type,
          description: `A ${type} widget`,
          type,
          size: 'small',
          getData: async () => ({}),
        };
        expect(widget.type).toBe(type);
      }
    });

    it('should support all widget sizes', () => {
      const sizes: WidgetDefinition['size'][] = ['small', 'medium', 'large'];
      for (const size of sizes) {
        const widget: WidgetDefinition = {
          id: `widget-${size}`,
          name: size,
          description: `A ${size} widget`,
          type: 'stat',
          size,
          getData: async () => ({}),
        };
        expect(widget.size).toBe(size);
      }
    });
  });

  describe('ChannelDefinition', () => {
    it('should create a valid channel definition', () => {
      let connected = false;
      const channel: ChannelDefinition = {
        name: 'irc',
        displayName: 'IRC',
        description: 'Internet Relay Chat adapter',
        configSchema: {
          server: { type: 'string', description: 'IRC server hostname', required: true },
          port: { type: 'number', description: 'IRC server port' },
        },
        connect: async () => { connected = true; },
        disconnect: async () => { connected = false; },
        send: async (channelId, message) => ({ success: true }),
      };

      expect(channel.name).toBe('irc');
      expect(channel.configSchema?.server.required).toBe(true);
    });

    it('should handle connect and disconnect lifecycle', async () => {
      let state = 'disconnected';
      const channel: ChannelDefinition = {
        name: 'test',
        displayName: 'Test',
        description: 'Test channel',
        connect: async () => { state = 'connected'; },
        disconnect: async () => { state = 'disconnected'; },
        send: async () => ({ success: true }),
      };

      await channel.connect({});
      expect(state).toBe('connected');

      await channel.disconnect();
      expect(state).toBe('disconnected');
    });

    it('should send messages', async () => {
      const sent: Array<{ channelId: string; content: string }> = [];
      const channel: ChannelDefinition = {
        name: 'test',
        displayName: 'Test',
        description: 'Test channel',
        connect: async () => {},
        disconnect: async () => {},
        send: async (channelId, message) => {
          sent.push({ channelId, content: message.content });
          return { success: true };
        },
      };

      const result = await channel.send('general', { content: 'Hello!' });
      expect(result.success).toBe(true);
      expect(sent).toEqual([{ channelId: 'general', content: 'Hello!' }]);
    });

    it('should support onMessage handler', () => {
      const messages: string[] = [];
      const channel: ChannelDefinition = {
        name: 'test',
        displayName: 'Test',
        description: 'Test channel',
        connect: async () => {},
        disconnect: async () => {},
        send: async () => ({ success: true }),
        onMessage: (handler) => {
          handler({ channelId: 'ch1', senderId: 'user1', content: 'hi' });
        },
      };

      channel.onMessage!((msg) => {
        messages.push(msg.content);
      });

      expect(messages).toEqual(['hi']);
    });
  });

  describe('PluginManifest with new types', () => {
    it('should accept optional commands, routes, widgets, and channels', () => {
      const manifest: PluginManifest = {
        name: 'full-plugin',
        version: '1.0.0',
        permissions: [],
        tools: [{
          name: 'test_tool',
          description: 'A test tool',
          parameters: { type: 'object', properties: {}, required: [] },
          execute: async () => ({ success: true }),
        }],
        commands: [{
          name: 'test',
          description: 'Test command',
          execute: async () => 'ok',
        }],
        routes: [{
          method: 'GET',
          path: '/test',
          description: 'Test route',
          handler: async () => ({ status: 200, body: null }),
        }],
        widgets: [{
          id: 'test-widget',
          name: 'Test',
          description: 'Test widget',
          type: 'stat',
          size: 'small',
          getData: async () => ({}),
        }],
        channels: [{
          name: 'test-channel',
          displayName: 'Test Channel',
          description: 'Test channel',
          connect: async () => {},
          disconnect: async () => {},
          send: async () => ({ success: true }),
        }],
      };

      expect(manifest.commands).toHaveLength(1);
      expect(manifest.routes).toHaveLength(1);
      expect(manifest.widgets).toHaveLength(1);
      expect(manifest.channels).toHaveLength(1);
    });
  });

  describe('PluginContext registration methods', () => {
    it('should have registerCommand, registerRoute, registerWidget, registerChannel', () => {
      const commands: CommandDefinition[] = [];
      const routes: RouteDefinition[] = [];
      const widgets: WidgetDefinition[] = [];
      const channels: ChannelDefinition[] = [];

      const context: PluginContext = {
        logger: {
          info: () => {},
          warn: () => {},
          error: () => {},
          debug: () => {},
        },
        config: {},
        registerTool: () => {},
        registerBehavior: () => {},
        registerProvider: () => {},
        registerCommand: (cmd) => commands.push(cmd),
        registerRoute: (route) => routes.push(route),
        registerWidget: (widget) => widgets.push(widget),
        registerChannel: (channel) => channels.push(channel),
        getMemory: async () => undefined,
        sendMessage: async () => {},
      };

      context.registerCommand({
        name: 'test',
        description: 'Test',
        execute: async () => 'ok',
      });

      context.registerRoute({
        method: 'GET',
        path: '/test',
        description: 'Test',
        handler: async () => ({ status: 200, body: null }),
      });

      context.registerWidget({
        id: 'w1',
        name: 'Widget',
        description: 'Test',
        type: 'stat',
        size: 'small',
        getData: async () => ({}),
      });

      context.registerChannel({
        name: 'ch',
        displayName: 'Channel',
        description: 'Test',
        connect: async () => {},
        disconnect: async () => {},
        send: async () => ({ success: true }),
      });

      expect(commands).toHaveLength(1);
      expect(routes).toHaveLength(1);
      expect(widgets).toHaveLength(1);
      expect(channels).toHaveLength(1);
    });
  });
});
