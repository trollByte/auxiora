/**
 * Block types for structured streaming responses.
 */
export type BlockType = 'text' | 'code' | 'tool_use' | 'tool_result' | 'thinking';

/**
 * A content block within a streamed response.
 */
export interface ContentBlock {
  id: string;
  type: BlockType;
  /** Incremental content accumulated so far */
  content: string;
  /** Whether this block is complete */
  complete: boolean;
  /** Additional metadata (e.g. tool name, language) */
  metadata?: Record<string, unknown>;
}

/**
 * Events emitted by the block streamer to the WebSocket client.
 */
export type BlockStreamEvent =
  | { event: 'block_start'; block: ContentBlock }
  | { event: 'block_delta'; blockId: string; delta: string }
  | { event: 'block_stop'; blockId: string }
  | { event: 'stream_end'; blocks: ContentBlock[] };

/**
 * Callback for sending block stream events to a client.
 */
export type BlockStreamSender = (event: BlockStreamEvent) => void;

let blockCounter = 0;

function nextBlockId(): string {
  return `block_${++blockCounter}`;
}

/** Reset the block counter (for testing). */
export function resetBlockCounter(): void {
  blockCounter = 0;
}

/**
 * Manages a set of content blocks during a streaming response.
 * Tracks incremental deltas and emits structured events.
 */
export class BlockStream {
  private blocks: Map<string, ContentBlock> = new Map();
  private blockOrder: string[] = [];
  private sender: BlockStreamSender;

  constructor(sender: BlockStreamSender) {
    this.sender = sender;
  }

  /**
   * Start a new content block and emit block_start.
   */
  startBlock(type: BlockType, metadata?: Record<string, unknown>): string {
    const id = nextBlockId();
    const block: ContentBlock = {
      id,
      type,
      content: '',
      complete: false,
      metadata,
    };
    this.blocks.set(id, block);
    this.blockOrder.push(id);
    this.sender({ event: 'block_start', block: { ...block } });
    return id;
  }

  /**
   * Append content to an existing block and emit block_delta.
   */
  appendDelta(blockId: string, delta: string): void {
    const block = this.blocks.get(blockId);
    if (!block || block.complete) return;

    block.content += delta;
    this.sender({ event: 'block_delta', blockId, delta });
  }

  /**
   * Mark a block as complete and emit block_stop.
   */
  stopBlock(blockId: string): void {
    const block = this.blocks.get(blockId);
    if (!block || block.complete) return;

    block.complete = true;
    this.sender({ event: 'block_stop', blockId });
  }

  /**
   * End the entire stream and emit stream_end with all blocks.
   */
  end(): ContentBlock[] {
    // Auto-complete any incomplete blocks
    for (const block of this.blocks.values()) {
      if (!block.complete) {
        block.complete = true;
      }
    }
    const allBlocks = this.blockOrder.map(id => ({ ...this.blocks.get(id)! }));
    this.sender({ event: 'stream_end', blocks: allBlocks });
    return allBlocks;
  }

  /**
   * Get all blocks in order.
   */
  getBlocks(): ContentBlock[] {
    return this.blockOrder.map(id => ({ ...this.blocks.get(id)! }));
  }

  /**
   * Get a single block by ID.
   */
  getBlock(blockId: string): ContentBlock | undefined {
    const block = this.blocks.get(blockId);
    return block ? { ...block } : undefined;
  }
}

/**
 * A tool output streamer that emits partial results as the tool runs.
 * Wraps a callback-based pattern for progressive output.
 */
export class ToolOutputStream {
  private blockStream: BlockStream;
  private blockId: string;
  private toolName: string;

  constructor(blockStream: BlockStream, toolName: string, toolInput?: Record<string, unknown>) {
    this.blockStream = blockStream;
    this.toolName = toolName;
    this.blockId = blockStream.startBlock('tool_result', {
      toolName,
      toolInput,
    });
  }

  /**
   * Write partial output from the tool.
   */
  write(data: string): void {
    this.blockStream.appendDelta(this.blockId, data);
  }

  /**
   * Complete the tool output stream.
   */
  end(finalData?: string): void {
    if (finalData) {
      this.blockStream.appendDelta(this.blockId, finalData);
    }
    this.blockStream.stopBlock(this.blockId);
  }

  getBlockId(): string {
    return this.blockId;
  }
}
