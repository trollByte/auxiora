# Memory System

> Auxiora remembers your preferences, learns your patterns, and builds a model of who you are -- with full transparency and control.

Auxiora's memory system persists knowledge about you across conversations. It categorizes memories by type, tracks their provenance, supports per-user partitions, and gives you complete control to view, edit, export, and selectively forget anything the assistant has learned.

---

## How Memory Works

The `MemoryStore` persists memories as JSON to `~/.auxiora/data/memories.json`. Each memory is a structured entry with content, category, source, importance score, confidence level, tags, and optional provenance metadata.

Memories are created from three sources:

| Source | How It Works |
|--------|-------------|
| **extracted** | Automatically extracted from conversation content by the memory extractor |
| **explicit** | You told the assistant directly ("Remember that I prefer TypeScript") |
| **observed** | Inferred from repeated behavior patterns over time |

When a new memory overlaps more than 50% with an existing one (by tag similarity), the existing memory is updated rather than duplicated. The store enforces a configurable maximum entry count (default: 1,000), evicting the oldest entries when the limit is reached.

---

## Memory Categories

Six categories organize what the assistant knows:

| Category | What It Stores | Example |
|----------|---------------|---------|
| **preference** | Your stated or observed preferences | "Prefers TypeScript over JavaScript" |
| **fact** | Factual knowledge about you or your context | "Works at Acme Corp as a senior engineer" |
| **context** | Situational, time-bound information | "Currently working on a database migration project" |
| **relationship** | Shared history and rapport markers | "Inside joke about rubber duck debugging" |
| **pattern** | Observed communication and behavior patterns | "Asks short questions, wants detailed answers" |
| **personality** | Signals for personality adaptation | "Responds well to direct feedback, dislikes hedging" |

Each memory also carries:

- **Importance** (0.0 to 1.0) -- How significant this memory is for future interactions
- **Confidence** (0.0 to 1.0) -- How certain the system is about the memory's accuracy
- **Sentiment** -- Positive, negative, or neutral
- **Tags** -- Automatically extracted keywords for search and deduplication
- **Access Count** -- How often this memory has been retrieved in conversation

---

## Memory Provenance

Every memory can carry provenance metadata that tracks exactly where it came from. The `MemoryProvenance` interface records:

| Field | Description |
|-------|-------------|
| **origin** | How the memory was created: `user_stated`, `extracted`, `inferred`, or `merged` |
| **sessionId** | The conversation session where this memory originated |
| **createdBy** | The agent or system component that created the memory |
| **sourceExcerpt** | The original message or context (truncated to 200 characters) |
| **extractionConfidence** | How confident the extraction was at creation time (0.0 to 1.0) |
| **derivedFrom** | IDs of parent memories (for merged or inferred memories) |

Provenance enables you to trace any memory back to its source conversation, understand why the assistant believes something, and make informed decisions about editing or removing memories.

When two memories are merged, the resulting memory receives `origin: 'merged'` and a `derivedFrom` array containing both parent IDs.

---

## Partitions

Memories are organized into partitions for multi-user and privacy control:

| Partition Type | Visibility | Use Case |
|---------------|-----------|----------|
| **private** | Only the owning user | Personal preferences, individual context |
| **shared** | Specific group of users | Team knowledge, project context |
| **global** | All users of the instance | System-wide facts, common settings |

Each memory has a `partitionId` (defaults to `global`). Partitions have an owner and optional member list. When retrieving memories for a conversation, the system queries the user's private partition, any shared partitions they belong to, and the global partition.

---

## Managing Memories

### Dashboard

The **Memory Manager** page in the web dashboard (`http://localhost:18800/dashboard`) provides a full interface for managing memories:

- **Browse** -- View all memories with sorting and pagination
- **Search** -- Full-text search across memory content and tags
- **Filter** -- Filter by category (preference, fact, context, relationship, pattern, personality)
- **Edit** -- Modify memory content, category, or importance directly
- **Delete** -- Remove individual memories
- **Forget** -- Selectively forget entire topics (see below)
- **Export** -- Download all personalization data in JSON format

### API

All memory operations are available through the REST API:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/memories` | GET | List all memories (filter with `?category=preference`) |
| `/memories/search?q=` | GET | Search memories by content and tags |
| `/memories/:id` | PATCH | Update a memory's content, category, or importance |
| `/memories/:id` | DELETE | Remove a single memory |
| `/forget` | POST | Selectively forget a topic (see below) |
| `/export/personalization` | GET | Export all personalization data (memories, preferences, user model) |
| `/memories/export` | GET | Bulk export memories in JSON format with version metadata |

### Selective Forgetting

Selective forgetting lets you remove all memories related to a specific topic while preserving everything else:

```
"Forget everything about my old job at Acme Corp"
```

This operation:

1. Searches all memories for matches against the topic
2. Removes matching memories across all categories
3. Marks related decisions in the Architect's decision log as abandoned
4. Logs the operation to the audit trail

Selective forgetting is available through the dashboard's Memory Manager ("Forget Topic" button), the `/forget` API endpoint, or by asking the assistant directly in conversation.

---

## Vector Store

Auxiora uses vector similarity search to find relevant memories during conversations:

- **In-memory cosine similarity** -- The default vector store computes embeddings and performs cosine similarity search in memory. Fast for moderate memory sizes, but not persisted across restarts.

- **SqliteVecStore** -- A persistent vector store backed by SQLite. Stores embeddings on disk for durability across restarts. Recommended for production deployments and larger memory collections.

The memory retriever uses a budget allocation system across categories, scoring memories by a combination of tag overlap, importance, recency, and access frequency to select the most relevant context for each conversation.

---

## Use Cases

### 1. Personal Context

Over time, Auxiora learns your tech stack, communication style, work patterns, and preferences. When you ask "help me set up a new project," it already knows you prefer TypeScript with strict mode, use pnpm workspaces, and like vitest for testing -- without you having to specify any of that again.

### 2. Selective Forgetting

Changed jobs? "Forget everything about Acme Corp" removes all related memories -- project context, team relationships, workflow patterns -- while keeping your technical preferences, personal goals, and everything else intact.

### 3. Data Export

Full GDPR-style export of everything Auxiora knows about you, in JSON format. The export includes all memories with their provenance, categories, importance scores, and tags. Use the `/export/personalization` endpoint or the dashboard's Export button.

### 4. Memory Editing

The assistant extracted an incorrect memory? Open the Memory Manager in the dashboard, find the entry, and edit it directly. You can change the content, recategorize it, adjust its importance, or delete it entirely. All edits are audit-logged.

---

## Related Documentation

- [Personality System](personality.md) -- How personality adapts based on memory
- [Dashboard](dashboard.md) -- Memory Manager UI
- [Vault & Security](vault-and-security.md) -- Encryption and audit logging
