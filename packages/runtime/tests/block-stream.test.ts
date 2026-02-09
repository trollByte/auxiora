import { describe, it, expect, beforeEach } from 'vitest';
import {
  BlockStream,
  ToolOutputStream,
  resetBlockCounter,
  type BlockStreamEvent,
  type ContentBlock,
} from '../src/block-stream.js';

describe('BlockStream', () => {
  let events: BlockStreamEvent[];
  let stream: BlockStream;

  beforeEach(() => {
    resetBlockCounter();
    events = [];
    stream = new BlockStream((event) => events.push(event));
  });

  it('should emit block_start when starting a block', () => {
    const id = stream.startBlock('text');

    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('block_start');
    const startEvent = events[0] as { event: 'block_start'; block: ContentBlock };
    expect(startEvent.block.id).toBe(id);
    expect(startEvent.block.type).toBe('text');
    expect(startEvent.block.content).toBe('');
    expect(startEvent.block.complete).toBe(false);
  });

  it('should emit block_delta when appending content', () => {
    const id = stream.startBlock('text');
    stream.appendDelta(id, 'Hello ');
    stream.appendDelta(id, 'world');

    expect(events).toHaveLength(3);
    expect(events[1]).toEqual({ event: 'block_delta', blockId: id, delta: 'Hello ' });
    expect(events[2]).toEqual({ event: 'block_delta', blockId: id, delta: 'world' });
  });

  it('should emit block_stop when completing a block', () => {
    const id = stream.startBlock('text');
    stream.appendDelta(id, 'Hello');
    stream.stopBlock(id);

    expect(events).toHaveLength(3);
    expect(events[2]).toEqual({ event: 'block_stop', blockId: id });
  });

  it('should not append to a completed block', () => {
    const id = stream.startBlock('text');
    stream.appendDelta(id, 'Hello');
    stream.stopBlock(id);
    stream.appendDelta(id, ' more');

    // Only 3 events: start, delta, stop — no second delta
    expect(events).toHaveLength(3);
    expect(stream.getBlock(id)?.content).toBe('Hello');
  });

  it('should emit stream_end with all blocks', () => {
    const id1 = stream.startBlock('text');
    stream.appendDelta(id1, 'Hello');
    stream.stopBlock(id1);

    const id2 = stream.startBlock('code', { language: 'typescript' });
    stream.appendDelta(id2, 'console.log("hi")');
    stream.stopBlock(id2);

    const blocks = stream.end();

    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe('text');
    expect(blocks[0].content).toBe('Hello');
    expect(blocks[0].complete).toBe(true);
    expect(blocks[1].type).toBe('code');
    expect(blocks[1].content).toBe('console.log("hi")');
    expect(blocks[1].metadata).toEqual({ language: 'typescript' });

    // Last event should be stream_end
    const lastEvent = events[events.length - 1] as { event: 'stream_end'; blocks: ContentBlock[] };
    expect(lastEvent.event).toBe('stream_end');
    expect(lastEvent.blocks).toHaveLength(2);
  });

  it('should auto-complete incomplete blocks on end', () => {
    const id = stream.startBlock('thinking');
    stream.appendDelta(id, 'reasoning...');
    // Don't explicitly stop

    const blocks = stream.end();
    expect(blocks[0].complete).toBe(true);
  });

  it('should manage multiple block types', () => {
    stream.startBlock('thinking');
    stream.startBlock('text');
    stream.startBlock('tool_use', { toolName: 'bash' });
    stream.startBlock('tool_result', { toolName: 'bash' });
    stream.startBlock('code', { language: 'python' });

    const blocks = stream.getBlocks();
    expect(blocks).toHaveLength(5);
    expect(blocks.map(b => b.type)).toEqual(['thinking', 'text', 'tool_use', 'tool_result', 'code']);
  });

  it('should return undefined for unknown block ID', () => {
    expect(stream.getBlock('nonexistent')).toBeUndefined();
  });

  it('should not stop an already stopped block', () => {
    const id = stream.startBlock('text');
    stream.stopBlock(id);
    stream.stopBlock(id); // Second stop should be ignored

    // Only 2 events: start, stop
    expect(events).toHaveLength(2);
  });

  it('should ignore delta for unknown block ID', () => {
    stream.appendDelta('nonexistent', 'data');
    expect(events).toHaveLength(0);
  });

  it('should generate unique block IDs', () => {
    const id1 = stream.startBlock('text');
    const id2 = stream.startBlock('text');
    const id3 = stream.startBlock('code');
    expect(id1).not.toBe(id2);
    expect(id2).not.toBe(id3);
  });
});

describe('ToolOutputStream', () => {
  let events: BlockStreamEvent[];
  let blockStream: BlockStream;

  beforeEach(() => {
    resetBlockCounter();
    events = [];
    blockStream = new BlockStream((event) => events.push(event));
  });

  it('should create a tool_result block on construction', () => {
    const toolStream = new ToolOutputStream(blockStream, 'bash', { command: 'ls' });

    expect(events).toHaveLength(1);
    const startEvent = events[0] as { event: 'block_start'; block: ContentBlock };
    expect(startEvent.block.type).toBe('tool_result');
    expect(startEvent.block.metadata).toEqual({ toolName: 'bash', toolInput: { command: 'ls' } });
    expect(toolStream.getBlockId()).toBe(startEvent.block.id);
  });

  it('should stream partial output via write', () => {
    const toolStream = new ToolOutputStream(blockStream, 'bash');

    toolStream.write('line 1\n');
    toolStream.write('line 2\n');
    toolStream.write('line 3\n');

    // 1 start + 3 deltas = 4 events
    expect(events).toHaveLength(4);
    expect(events[1]).toEqual({
      event: 'block_delta',
      blockId: toolStream.getBlockId(),
      delta: 'line 1\n',
    });
  });

  it('should complete on end with optional final data', () => {
    const toolStream = new ToolOutputStream(blockStream, 'bash');

    toolStream.write('partial...');
    toolStream.end(' done');

    // 1 start + 1 write delta + 1 final delta + 1 stop = 4 events
    expect(events).toHaveLength(4);
    const block = blockStream.getBlock(toolStream.getBlockId());
    expect(block?.content).toBe('partial... done');
    expect(block?.complete).toBe(true);
  });

  it('should complete on end without final data', () => {
    const toolStream = new ToolOutputStream(blockStream, 'read_file');
    toolStream.write('file contents');
    toolStream.end();

    const block = blockStream.getBlock(toolStream.getBlockId());
    expect(block?.content).toBe('file contents');
    expect(block?.complete).toBe(true);
  });

  it('should work alongside other blocks in the stream', () => {
    // Simulate: text block, then tool use, then tool result
    const textId = blockStream.startBlock('text');
    blockStream.appendDelta(textId, 'Let me run that command.');
    blockStream.stopBlock(textId);

    const toolUseId = blockStream.startBlock('tool_use', { toolName: 'bash', toolInput: { command: 'ls' } });
    blockStream.appendDelta(toolUseId, '{"command":"ls"}');
    blockStream.stopBlock(toolUseId);

    // Tool result via ToolOutputStream
    const toolStream = new ToolOutputStream(blockStream, 'bash', { command: 'ls' });
    toolStream.write('file1.txt\n');
    toolStream.write('file2.txt\n');
    toolStream.end();

    const blocks = blockStream.getBlocks();
    expect(blocks).toHaveLength(3);
    expect(blocks[0].type).toBe('text');
    expect(blocks[1].type).toBe('tool_use');
    expect(blocks[2].type).toBe('tool_result');
    expect(blocks[2].content).toBe('file1.txt\nfile2.txt\n');
  });
});
