# Research Agent

> Deep multi-source research with automatic query decomposition, citation tracking, and structured synthesis.

## Overview

The research agent transforms a broad question into a structured, cited report. Rather than relying on a single search, it decomposes your question into targeted sub-queries, fans them out across multiple sources, cross-references findings, and synthesizes the results into a coherent report with full source attribution. The process is iterative -- if initial findings reveal gaps or contradictions, the agent generates follow-up queries to resolve them before finalizing the report.

## How It Works

The research pipeline follows five stages:

1. **Decompose** -- The input question is analyzed and broken into 3--8 focused sub-queries. Each sub-query targets a specific facet of the original question (e.g., "Compare SQLite WAL vs journal mode" becomes sub-queries for write throughput benchmarks, concurrent reader behavior, crash recovery guarantees, and disk usage characteristics).

2. **Search** -- Sub-queries are dispatched to multiple sources in parallel:
   - **Web search** -- General and domain-specific search engines
   - **Connected services** -- Notion pages, Obsidian notes, GitHub repos, Google Drive documents (any active connector)
   - **Local knowledge** -- Auxiora's memory store and previous research results

3. **Evaluate** -- Each result is scored for relevance, recency, and source authority. Duplicate or near-duplicate content is deduplicated. Low-confidence results are flagged for follow-up.

4. **Refine** -- If the evaluation stage identifies gaps (unanswered sub-queries, conflicting sources, or insufficient evidence), the agent generates additional targeted queries and repeats the search-evaluate cycle. The default refinement limit is 2 additional rounds.

5. **Synthesize** -- Validated findings are organized into a structured report with section headings, inline citations, a source list, and a confidence assessment per section.

## Features

### Multi-Source Search

The agent searches across all available data sources simultaneously. Web results are combined with content from your connected services and local memory, giving you a single unified answer that incorporates both public knowledge and your private context.

### Automatic Query Decomposition

Complex questions are broken into precise sub-queries that target different dimensions of the problem. This produces more relevant results than a single broad search and ensures no important facet is overlooked.

### Citation Tracking

Every claim in the synthesized report is linked to its source. Citations include:

- Source URL or document reference
- Retrieval timestamp
- Relevance score
- Source type (web, connector, memory)

This makes it straightforward to verify any claim or dig deeper into a specific source.

### Iterative Refinement

The agent does not stop at the first set of results. It evaluates whether the collected evidence sufficiently answers the original question and automatically generates follow-up queries to fill gaps. This self-correcting behavior produces more thorough reports than a single-pass search.

### Structured Reports

Output follows a consistent format:

```
## [Report Title]

### Executive Summary
[2-3 sentence overview of key findings]

### [Section 1: Sub-topic]
[Findings with inline citations [1][2]]

### [Section 2: Sub-topic]
[Findings with inline citations [3][4]]

...

### Confidence Assessment
[Per-section confidence: high/medium/low with reasoning]

### Sources
[1] Title — URL — Retrieved 2026-02-24
[2] Title — Document name — Retrieved 2026-02-24
...
```

## Configuration

Research behavior can be tuned in your configuration:

```json
{
  "research": {
    "maxRefinementRounds": 2,
    "maxSubQueries": 8,
    "sourcePriority": ["connectors", "memory", "web"],
    "includeLocalKnowledge": true,
    "citationStyle": "numbered"
  }
}
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| `maxRefinementRounds` | 2 | Maximum iterative refinement cycles |
| `maxSubQueries` | 8 | Maximum sub-queries per decomposition |
| `sourcePriority` | `["connectors", "memory", "web"]` | Search order preference |
| `includeLocalKnowledge` | true | Include Auxiora memory in search sources |
| `citationStyle` | `"numbered"` | Citation format (`numbered` or `inline`) |

## Use Cases

### 1. Competitive Analysis

You ask: "Research the top 5 competitors in the observability space. Compare pricing, features, and market positioning."

The agent decomposes this into sub-queries for each major competitor (Datadog, Grafana, New Relic, Splunk, Honeycomb), plus cross-cutting queries for pricing comparison and market share data. It searches public pricing pages, analyst reports, and your Notion workspace for any existing competitive notes. The final report includes a feature comparison table, pricing tier breakdown, and market positioning analysis -- each claim cited to its source.

### 2. Technical Deep Dive

You ask: "What are the trade-offs between SQLite WAL mode and journal mode for concurrent writes? Include benchmarks."

The agent generates sub-queries targeting write throughput under contention, reader-writer concurrency semantics, crash recovery behavior, disk space overhead, and published benchmark results. It pulls from SQLite documentation, database engineering blogs, and academic papers. If benchmarks conflict, it flags the discrepancy and searches for methodology differences. The report includes a trade-off summary table with citations to specific benchmark results.

### 3. Decision Support

You ask: "Should we migrate from REST to gRPC? Research performance characteristics, ecosystem maturity, and migration effort for a Node.js monorepo."

The agent breaks this into performance benchmarks (latency, throughput, payload size), ecosystem analysis (Node.js library maturity, tooling, community activity), migration effort estimation (code generation, breaking changes, testing overhead), and operational considerations (load balancing, debugging, browser support). It also checks your GitHub repos and Notion docs for existing architecture decisions. The report concludes with a recommendation matrix weighing each factor, with all evidence cited.

## Related Documentation

- [Orchestration & ReAct](orchestration.md) -- Research agents can run within orchestration patterns (e.g., map-reduce for parallel sub-topic research)
- [Service Connectors](connectors.md) -- Connected services expand the research agent's source pool
- [Memory](memory.md) -- Previous research results are stored in memory for future reference
- [Browser Control](browser.md) -- Web research leverages the headless browser for content extraction
