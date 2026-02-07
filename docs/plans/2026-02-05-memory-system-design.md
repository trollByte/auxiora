# Memory System Design

## Goal

Give Auxiora persistent long-term memory so it remembers facts about the user, their preferences, and context across conversations.

## Architecture

New package: `packages/memory/` — Memory store, retriever, extractor, and tools.

Memories are atomic facts stored in a JSON file at `~/.auxiora/workspace/memory/memories.json`. Two modes of operation: automatic extraction (AI identifies facts from conversations) and explicit tools (user/AI saves and recalls memories on demand). Before each provider call, relevant memories are appended to the system prompt.

---

## Data Model

```typescript
interface MemoryEntry {
  id: string;              // "mem-" + nanoid
  content: string;         // "User prefers dark mode in all apps"
  category: 'preference' | 'fact' | 'context';
  source: 'extracted' | 'explicit';
  createdAt: number;
  updatedAt: number;
  accessCount: number;
  tags: string[];          // extracted keywords for matching
}
```

**Categories:**
- `preference` — things the user likes/dislikes
- `fact` — biographical/personal details
- `context` — project/situational context

**Deduplication:** Before saving, check existing entries for tag overlap (>50% intersection). If matched, update the existing entry instead of creating a duplicate.

**Storage:** Single JSON file, array of entries. Same read-all/write-all pattern as behaviors and webhooks. Max 500 entries (configurable).

---

## Memory Tools

Four tools registered with `toolRegistry`:

| Tool | Description | Permission |
|------|-------------|------------|
| `save_memory` | Store a fact (content + optional category) | AUTO_APPROVE |
| `recall_memory` | Search memories by keyword query | AUTO_APPROVE |
| `forget_memory` | Delete a memory by ID | USER_APPROVAL |
| `list_memories` | List all memories grouped by category | AUTO_APPROVE |

---

## Automatic Extraction

After each AI response, the runtime sends the last conversation turn (user message + assistant response) to the provider with a dedicated extraction prompt:

> "Extract any new facts about the user from this exchange. Return a JSON array of objects with `content` and `category` fields, or an empty array if there are no new facts."

Guardrails:
- Only runs if user message is >20 characters (skip "ok", "thanks", etc.)
- Uses the same provider with small `max_tokens` (200) to keep cost low
- Extracted facts are saved with `source: 'extracted'`
- Deduplication prevents storing facts the system already knows

---

## Memory Injection

Before each provider call, the `MemoryRetriever` selects relevant memories and appends them to the system prompt:

```
---

## What you know about the user

- Prefers TypeScript over JavaScript (preference)
- Works at Acme Corp as a senior engineer (fact)
- Currently building a plugin system for Auxiora (context)
```

**Relevance scoring** (applied to each memory given the current user message):
1. Tag overlap — how many memory tags appear in the user message (highest weight)
2. Recency — recently updated memories score higher
3. Access frequency — frequently accessed memories score higher

The top memories fitting within ~500 tokens are selected. If no memories score above a minimum threshold, the section is omitted entirely.

---

## Components

| Component | Responsibility |
|-----------|---------------|
| `MemoryStore` | CRUD + search over memories.json |
| `MemoryRetriever` | Relevance scoring + prompt formatting |
| `MemoryExtractor` | Extraction prompt + response parsing |
| `MemoryTools` | Registers 4 tools with toolRegistry |

---

## Runtime Integration

**Initialization order:** Memory system initializes after the tool system (so tools can register) but before behaviors start.

**Message handling:** In `handleMessage()` and `handleChannelMessage()`, before calling the provider:
1. `MemoryRetriever` scores memories against the current message
2. Relevant memories are appended to `this.systemPrompt`
3. Provider is called with the enriched prompt

After the provider responds:
1. `MemoryExtractor` sends the conversation turn for fact extraction
2. New facts are saved via `MemoryStore`

**Dashboard:** Read-only `GET /api/v1/dashboard/memories` endpoint returning all memories.

**Audit events:** `memory.saved`, `memory.deleted`, `memory.extracted`.

---

## Configuration

```typescript
memory: z.object({
  enabled: z.boolean().default(true),
  autoExtract: z.boolean().default(true),
  maxEntries: z.number().default(500),
})
```

---

## Security

| Concern | Mitigation |
|---------|------------|
| Sensitive data stored | User controls the file; same trust model as vault |
| Extraction hallucination | Dedup prevents duplicate noise; user can `forget_memory` |
| Prompt bloat | 500-token cap on injected memories |
| Cost of extraction | Small max_tokens (200), skip short messages |

---

## Testing Strategy

- **MemoryStore tests** (~6): add, update, remove, search by tags, dedup on overlap, respect maxEntries
- **MemoryRetriever tests** (~4): rank by tag overlap, rank by recency, token budget cap, omit when no matches
- **MemoryExtractor tests** (~2): parse valid extraction, handle empty extraction
- **MemoryTools tests** (~2): save_memory round-trip, recall_memory search
- **Integration test** (~1): extract from conversation, inject into prompt

~15 new tests, bringing project total to ~332.

---

## Future Scope (not v1.9)

- **Semantic search** — Embedding-based retrieval for better matching
- **Memory decay** — Reduce relevance of old, unaccessed memories over time
- **Memory export/import** — Backup and restore memories as JSON
- **Per-channel memories** — Different memory contexts for Discord vs Telegram
- **Memory summarization** — Periodically condense related memories into summaries
