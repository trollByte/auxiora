# MCP Integration

> Model Context Protocol: expose Auxiora as tools for other AI agents, and connect to external MCP servers.

## Overview

[MCP (Model Context Protocol)](https://modelcontextprotocol.io/) is an open standard for connecting AI models to external tools and data sources. Auxiora supports MCP in both directions:

- **MCP Server** -- Expose Auxiora's memory, personality, and messaging as tools that other AI clients can call.
- **MCP Client** -- Connect Auxiora to external MCP servers, making their tools available to the assistant.

## MCP Server (Exposing Auxiora)

When running as an MCP server, Auxiora exposes 7 tools that any MCP-compatible AI client can invoke.

### Available Tools

| Tool | Parameters | Description |
|------|-----------|-------------|
| `memory_search` | `query: string` | Search Auxiora's memory store for relevant memories matching the query |
| `memory_list` | *(none)* | List all stored memories across all categories |
| `memory_add` | `content: string`, `category: enum` | Add a new memory (categories: preference, fact, context, relationship, pattern, personality) |
| `memory_delete` | `id: string` | Delete a specific memory by its ID |
| `user_model_get` | *(none)* | Get the synthesized user model with domain expertise, communication style, and satisfaction data |
| `personality_get` | *(none)* | Get the current personality configuration |
| `send_message` | `message: string` | Send a message to Auxiora and receive a response |

### Setup

#### Claude Desktop

Add Auxiora as an MCP server in your Claude Desktop configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "auxiora": {
      "command": "auxiora",
      "args": ["mcp-server"],
      "env": {}
    }
  }
}
```

The MCP server communicates over stdio transport, making it compatible with any MCP client that supports the stdio protocol.

#### Other MCP Clients

Any MCP-compatible client can connect to Auxiora's server. Point the client at the `auxiora mcp-server` command using stdio transport.

### Server Details

- **Server name:** `auxiora`
- **Protocol:** MCP over stdio
- **SDK:** `@modelcontextprotocol/sdk`
- **Transport:** `StdioServerTransport`

## MCP Client (Connecting External Servers)

Auxiora can connect to external MCP servers as a client, making their tools available to the assistant during conversations. This is configured in `~/.auxiora/config.json`.

### Supported Transports

| Transport | Description | Use Case |
|-----------|-------------|----------|
| Stdio | Launches a local process and communicates via stdin/stdout | Local tools, CLI-based servers |
| SSE | Connects to an HTTP server using Server-Sent Events | Remote servers, web services |
| Streamable HTTP | Connects via HTTP with streaming support | Modern MCP servers |

### Configuration

```json
{
  "mcp": {
    "servers": {
      "weather": {
        "transport": "stdio",
        "command": "weather-mcp-server",
        "args": ["--api-key", "YOUR_KEY"]
      },
      "database": {
        "transport": "sse",
        "url": "http://localhost:3001/mcp"
      }
    }
  }
}
```

### Tool Adaptation

External MCP tools are automatically adapted to Auxiora's internal tool format. JSON Schema parameters from MCP tool definitions are converted to Auxiora tool parameters, so the assistant can call external tools seamlessly alongside built-in tools.

## Use Cases

1. **Claude Desktop integration** -- Add Auxiora as an MCP server in Claude Desktop. Claude can search your memories, retrieve your user model for context-aware responses, check your personality configuration, and send messages through your connected channels -- all without leaving the Claude Desktop interface.

2. **Multi-agent workflow** -- External AI agents access Auxiora's memory and personality context through MCP tools. A research agent queries your stored preferences and domain expertise via `memory_search` and `user_model_get` to produce personalized reports. A scheduling agent uses `send_message` to deliver summaries through your preferred channels.

3. **Tool aggregation** -- Connect weather, stock, and news MCP servers to give Auxiora access to real-time data sources. The assistant can check the weather before your commute, monitor stock prices for your portfolio, and pull current headlines -- all through standard MCP tool calls without custom connector code.
