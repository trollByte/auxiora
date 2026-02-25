# AI Providers

> Connect 10+ AI providers. Route tasks to the right model automatically. Track costs.

## Supported Providers

| Provider | Models | Streaming | Tool Use | Thinking |
|----------|--------|-----------|----------|----------|
| Anthropic | Claude Opus 4.6, Sonnet 4.6, Haiku 4.5 | Yes | Yes | Yes |
| OpenAI | GPT-5.3, 5.2, 5, 4.1 | Yes | Yes | Yes |
| Google | Gemini 3.1, 2.5 (Pro, Flash) | Yes | Yes | Yes |
| Groq | Llama, Mixtral | Yes | Yes | No |
| Ollama | Any local model | Yes | Yes | No |
| DeepSeek | DeepSeek V3/R1 | Yes | Yes | Yes |
| Cohere | Command R+ | Yes | Yes | No |
| xAI | Grok 3, 2 | Yes | Yes | No |
| Replicate | Any hosted model | Yes | Varies | No |
| OpenAI-compatible | vLLM, LiteLLM, etc. | Yes | Varies | No |

All providers implement the same `Provider` interface: `complete()` for single-shot responses and `stream()` for token-by-token streaming. Each provider reports its model capabilities (context window, vision support, tool use, cost per token, strengths) through a standard `ProviderMetadata` structure.

### Thinking Levels

Providers that support thinking/reasoning (Anthropic, OpenAI, Google, DeepSeek) accept a `thinkingLevel` parameter with five settings: `off`, `low`, `medium`, `high`, and `xhigh`. This maps to provider-specific parameters (e.g., Anthropic's `budget_tokens`, OpenAI's `reasoning_effort` for o-series models).

### Key Rotation and Failover

Every provider that accepts API keys supports multiple keys (`apiKeys` array). Auxiora rotates across keys automatically and includes per-provider cooldown logic: if a key hits a rate limit or error, it is temporarily sidelined and traffic shifts to the next available key. Profile-level cooldowns prevent cascading failures across providers.

## Setup

### Via Dashboard

Navigate to **Settings > Provider** in the web dashboard. Select your provider, enter your API key (stored in the vault), choose a default model, and save. The dashboard validates the key by making a test request.

### Via Vault + Config

```bash
# Store your API key securely
auxiora vault add ANTHROPIC_API_KEY

# Optionally add a fallback provider
auxiora vault add OPENAI_API_KEY
```

Then configure providers in `~/.auxiora/config.json`:

```json
{
  "providers": {
    "primary": "anthropic",
    "fallback": "openai",
    "anthropic": {
      "model": "claude-sonnet-4-6",
      "maxTokens": 4096
    },
    "openai": {
      "model": "gpt-5.2",
      "maxTokens": 4096
    }
  }
}
```

When the primary provider is unavailable (rate limited, down, or over budget), Auxiora automatically falls back to the next configured provider.

### Local Models (Ollama)

For fully local, private inference with no API keys required:

```bash
# Install and pull a model
ollama pull llama3.1
```

Configure Auxiora to use it:

```json
{
  "providers": {
    "primary": "ollama",
    "ollama": {
      "baseUrl": "http://127.0.0.1:11434",
      "model": "llama3.1",
      "maxTokens": 4096
    }
  }
}
```

Ollama runs entirely on your machine. No data leaves your network.

### OpenAI-Compatible Endpoints

For self-hosted inference servers (vLLM, LiteLLM, LocalAI, etc.):

```json
{
  "providers": {
    "primary": "openaiCompatible",
    "openaiCompatible": {
      "baseUrl": "https://your-vllm-server.internal/v1",
      "apiKey": "your-key",
      "model": "meta-llama/Llama-3.1-70B-Instruct",
      "name": "internal-vllm"
    }
  }
}
```

## Model Routing

### How It Works

Auxiora's model routing classifies each incoming message by task type (code, creative, simple conversation, research, etc.) and routes it to the best provider/model combination based on your configured rules. This lets you optimize for cost, quality, privacy, or speed depending on the task.

The routing pipeline:

1. **Task classification** -- The message is analyzed to determine its category (code, creative, simple, research, etc.).
2. **Rule matching** -- The classified task is matched against your routing rules in priority order.
3. **Provider selection** -- The matched rule's provider and model are selected. If that provider is unavailable, fallback rules apply.
4. **Cost check** -- Before execution, the estimated cost is checked against your budget limits.

### Routing Rules

```json
{
  "routing": {
    "enabled": true,
    "rules": [
      {
        "task": "code",
        "provider": "anthropic",
        "model": "claude-sonnet-4-6",
        "priority": 1
      },
      {
        "task": "creative",
        "provider": "openai",
        "model": "gpt-5.2",
        "priority": 1
      },
      {
        "task": "simple",
        "provider": "groq",
        "model": "llama-3.3-70b-versatile",
        "priority": 1
      }
    ]
  }
}
```

Rules are evaluated in priority order. The first matching rule wins. If no rule matches, the primary provider is used.

### Cost Tracking

Set budget limits to prevent surprise bills:

```json
{
  "routing": {
    "costLimits": {
      "dailyBudget": 10.00,
      "monthlyBudget": 100.00,
      "perMessageMax": 0.50,
      "warnAt": 0.8
    }
  }
}
```

| Setting | Description |
|---------|-------------|
| `dailyBudget` | Maximum spend per calendar day (USD). Requests are blocked when exceeded. |
| `monthlyBudget` | Maximum spend per calendar month (USD). |
| `perMessageMax` | Maximum estimated cost for a single message. Expensive requests are blocked or downgraded to a cheaper model. |
| `warnAt` | Warning threshold as a fraction of the budget (0.0-1.0). At 0.8, you get a warning when 80% of the daily or monthly budget is consumed. |

Cost estimates are based on the per-token pricing reported by each provider's model capabilities metadata (input and output token costs).

## Use Cases

1. **Budget-conscious** -- Route simple queries to Groq (free tier or low-cost Llama inference) and reserve Anthropic Claude for complex coding and analysis tasks. Set a `dailyBudget` of $5 and a `perMessageMax` of $0.25 to stay in control.

2. **Privacy-first** -- Use Ollama as the primary provider so all inference runs locally. Configure a cloud provider (e.g., Anthropic) as a fallback only for tasks that exceed local model capabilities. No data leaves your network unless the local model explicitly cannot handle the request.

3. **Best-of-breed** -- Anthropic for code generation and review (strongest at structured reasoning), OpenAI for creative writing and brainstorming, Google Gemini for research tasks with large context windows. Each task type goes to the provider with the strongest track record for that domain.

4. **Enterprise** -- Point the OpenAI-compatible endpoint at your organization's own vLLM or LiteLLM deployment behind a corporate VPN. All traffic stays within your infrastructure. Combine with Ollama on developer laptops for offline work.

---

**See also:** [Vault & Security](vault-and-security.md) | [CLI Reference](cli.md) | [Getting Started](../guide/getting-started.md)
