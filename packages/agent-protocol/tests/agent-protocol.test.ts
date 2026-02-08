import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { MessageSigner } from '../src/signing.js';
import { AgentDirectory } from '../src/directory.js';
import { AgentProtocol } from '../src/protocol.js';
import { ProtocolServer } from '../src/server.js';
import { formatAgentId, parseAgentId } from '../src/types.js';
import type { AgentIdentifier } from '../src/types.js';

describe('AgentIdentifier', () => {
  it('should format agent identifier', () => {
    const id: AgentIdentifier = { user: 'alice', host: 'example.com' };
    expect(formatAgentId(id)).toBe('auxiora://alice@example.com');
  });

  it('should parse agent URI', () => {
    const id = parseAgentId('auxiora://bob@local.net');
    expect(id).toBeDefined();
    expect(id!.user).toBe('bob');
    expect(id!.host).toBe('local.net');
  });

  it('should return undefined for invalid URI', () => {
    expect(parseAgentId('http://example.com')).toBeUndefined();
    expect(parseAgentId('invalid')).toBeUndefined();
  });
});

describe('MessageSigner', () => {
  it('should generate a key pair', () => {
    const keyPair = MessageSigner.generateKeyPair();
    expect(keyPair.publicKey).toContain('BEGIN PUBLIC KEY');
    expect(keyPair.privateKey).toContain('BEGIN PRIVATE KEY');
  });

  it('should sign and verify a message', () => {
    const keyPair = MessageSigner.generateKeyPair();
    const signer = new MessageSigner(keyPair);

    const message = 'Hello, agent!';
    const signature = signer.sign(message);

    expect(typeof signature).toBe('string');
    expect(signer.verify(message, signature)).toBe(true);
  });

  it('should reject tampered message', () => {
    const keyPair = MessageSigner.generateKeyPair();
    const signer = new MessageSigner(keyPair);

    const signature = signer.sign('original');
    expect(signer.verify('tampered', signature)).toBe(false);
  });

  it('should verify with external public key', () => {
    const keyPair = MessageSigner.generateKeyPair();
    const signer = new MessageSigner(keyPair);

    const message = 'verify me';
    const signature = signer.sign(message);

    const verifier = new MessageSigner();
    expect(verifier.verify(message, signature, keyPair.publicKey)).toBe(true);
  });

  it('should throw when signing without private key', () => {
    const signer = new MessageSigner();
    expect(() => signer.sign('test')).toThrow('Private key not available');
  });
});

describe('AgentDirectory', () => {
  let tmpDir: string;
  let directory: AgentDirectory;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-dir-'));
    directory = new AgentDirectory({ dir: tmpDir });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should register an agent', async () => {
    const id: AgentIdentifier = { user: 'alice', host: 'local' };
    const entry = await directory.register(id, 'Alice Agent', 'pk-alice', 'https://alice.local/agent');

    expect(entry.displayName).toBe('Alice Agent');
    expect(entry.endpoint).toBe('https://alice.local/agent');
  });

  it('should lookup a registered agent', async () => {
    const id: AgentIdentifier = { user: 'bob', host: 'local' };
    await directory.register(id, 'Bob Agent', 'pk-bob', 'https://bob.local/agent', [
      { name: 'translate', description: 'Translate text' },
    ]);

    const found = await directory.lookup(id);
    expect(found).toBeDefined();
    expect(found!.capabilities).toHaveLength(1);
    expect(found!.capabilities[0].name).toBe('translate');
  });

  it('should update existing registration', async () => {
    const id: AgentIdentifier = { user: 'charlie', host: 'local' };
    await directory.register(id, 'Charlie v1', 'pk-1', 'https://old.local');
    await directory.register(id, 'Charlie v2', 'pk-2', 'https://new.local');

    const entries = await directory.listAll();
    expect(entries).toHaveLength(1);
    expect(entries[0].displayName).toBe('Charlie v2');
  });

  it('should search by name', async () => {
    await directory.register({ user: 'alice', host: 'local' }, 'Alice Bot', 'pk', 'https://a');
    await directory.register({ user: 'bob', host: 'local' }, 'Bob Bot', 'pk', 'https://b');

    const results = await directory.search('alice');
    expect(results).toHaveLength(1);
    expect(results[0].displayName).toBe('Alice Bot');
  });

  it('should search by capability', async () => {
    await directory.register(
      { user: 'translator', host: 'local' },
      'Translator',
      'pk',
      'https://t',
      [{ name: 'translate', description: 'Language translation' }],
    );

    const results = await directory.search('translate');
    expect(results).toHaveLength(1);
  });

  it('should remove an agent', async () => {
    const id: AgentIdentifier = { user: 'temp', host: 'local' };
    await directory.register(id, 'Temp', 'pk', 'https://t');

    const removed = await directory.remove(id);
    expect(removed).toBe(true);

    const found = await directory.lookup(id);
    expect(found).toBeUndefined();
  });
});

describe('AgentProtocol', () => {
  let tmpDir: string;
  let directory: AgentDirectory;
  let aliceProtocol: AgentProtocol;
  let bobProtocol: AgentProtocol;
  let aliceSigner: MessageSigner;
  let bobSigner: MessageSigner;

  const aliceId: AgentIdentifier = { user: 'alice', host: 'local' };
  const bobId: AgentIdentifier = { user: 'bob', host: 'local' };

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-proto-'));
    directory = new AgentDirectory({ dir: tmpDir });

    const aliceKeys = MessageSigner.generateKeyPair();
    const bobKeys = MessageSigner.generateKeyPair();

    aliceSigner = new MessageSigner(aliceKeys);
    bobSigner = new MessageSigner(bobKeys);

    await directory.register(aliceId, 'Alice', aliceKeys.publicKey, 'https://alice.local');
    await directory.register(bobId, 'Bob', bobKeys.publicKey, 'https://bob.local');

    aliceProtocol = new AgentProtocol(aliceId, aliceSigner, directory);
    bobProtocol = new AgentProtocol(bobId, bobSigner, directory);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should send a message', async () => {
    const message = await aliceProtocol.send(bobId, 'text', 'Hello Bob!');
    expect(message.id).toMatch(/^msg-/);
    expect(message.from).toEqual(aliceId);
    expect(message.to).toEqual(bobId);
    expect(message.signature).toBeDefined();
  });

  it('should receive and verify a message', async () => {
    const sent = await aliceProtocol.send(bobId, 'text', 'Signed message');

    // Bob receives the message
    await bobProtocol.receive(sent);
    const inbox = bobProtocol.getInbox();
    expect(inbox).toHaveLength(1);
    expect(inbox[0].payload).toBe('Signed message');
  });

  it('should reject message with invalid signature', async () => {
    const sent = await aliceProtocol.send(bobId, 'text', 'Hello');
    sent.signature = 'invalid-signature';

    await expect(bobProtocol.receive(sent)).rejects.toThrow('Invalid message signature');
  });

  it('should dispatch to message handler', async () => {
    let received = false;
    bobProtocol.onMessage('text', async (msg) => {
      received = true;
    });

    const sent = await aliceProtocol.send(bobId, 'text', 'Trigger handler');
    await bobProtocol.receive(sent);
    expect(received).toBe(true);
  });

  it('should discover agents', async () => {
    const results = await aliceProtocol.discover('bob');
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(bobId);
  });
});

describe('ProtocolServer', () => {
  let tmpDir: string;
  let server: ProtocolServer;
  let signer: MessageSigner;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-server-'));
    const directory = new AgentDirectory({ dir: tmpDir });
    const keys = MessageSigner.generateKeyPair();
    signer = new MessageSigner(keys);

    const agentId: AgentIdentifier = { user: 'server', host: 'local' };
    await directory.register(agentId, 'Server', keys.publicKey, 'https://server.local');

    const protocol = new AgentProtocol(agentId, signer, directory);
    server = new ProtocolServer(protocol);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should reject invalid request body', async () => {
    const result = await server.handleRequest(null);
    expect(result.status).toBe(400);
    expect(result.body.success).toBe(false);
  });

  it('should reject incomplete message', async () => {
    const result = await server.handleRequest({ id: 'test' });
    expect(result.status).toBe(400);
    expect(result.body.error).toContain('Missing required');
  });

  it('should process valid message', async () => {
    const result = await server.handleRequest({
      id: 'msg-1',
      from: { user: 'server', host: 'local' },
      to: { user: 'server', host: 'local' },
      type: 'ping',
      payload: '',
      timestamp: Date.now(),
    });

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
  });
});
