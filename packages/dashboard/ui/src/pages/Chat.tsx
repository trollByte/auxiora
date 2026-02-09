import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../api';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'error';
  content: string;
  model?: string;
}

interface ModelSelection {
  provider: string;
  model: string;
}

interface SlashCommand {
  command: string;
  description: string;
}

const SLASH_COMMANDS: SlashCommand[] = [
  { command: '/help', description: 'Show available commands' },
  { command: '/status', description: 'Show system status' },
  { command: '/new', description: 'Start a new session' },
  { command: '/reset', description: 'Clear current session' },
  { command: '/mode', description: 'Show current mode' },
  { command: '/mode auto', description: 'Auto-detect mode from messages' },
  { command: '/mode off', description: 'Disable modes for this session' },
  { command: '/mode operator', description: 'Fast, action-oriented execution' },
  { command: '/mode analyst', description: 'Deep reasoning and analysis' },
  { command: '/mode advisor', description: 'Strategic guidance and decisions' },
  { command: '/mode writer', description: 'Creative and polished writing' },
  { command: '/mode socratic', description: 'Question-based learning' },
  { command: '/mode legal', description: 'Legal research and analysis' },
  { command: '/mode roast', description: 'Playful, witty critique' },
  { command: '/mode companion', description: 'Warm, supportive conversation' },
];

/** Turn a raw model ID into a friendly display name */
function friendlyModelName(id: string): string {
  // Anthropic — order matters: more specific prefixes first
  if (id.startsWith('claude-opus-4-6'))      return 'Claude Opus 4.6';
  if (id.startsWith('claude-sonnet-4-5'))    return 'Claude Sonnet 4.5';
  if (id.startsWith('claude-haiku-4-5'))     return 'Claude Haiku 4.5';
  if (id.startsWith('claude-opus-4'))        return 'Claude Opus 4';
  if (id.startsWith('claude-sonnet-4'))      return 'Claude Sonnet 4';
  if (id.startsWith('claude-3-5-haiku'))     return 'Claude Haiku 3.5';
  if (id.startsWith('claude-3-5-sonnet'))    return 'Claude Sonnet 3.5';
  if (id.startsWith('claude-3-opus'))        return 'Claude Opus 3';
  // OpenAI
  if (id === 'gpt-4o')        return 'GPT-4o';
  if (id === 'gpt-4o-mini')   return 'GPT-4o Mini';
  if (id === 'gpt-4-turbo')   return 'GPT-4 Turbo';
  if (id.startsWith('o1'))    return id.toUpperCase();
  if (id.startsWith('o3'))    return id.toUpperCase();
  // Google
  if (id.startsWith('gemini-'))return id.replace('gemini-', 'Gemini ');
  return id;
}

/**
 * Lightweight markdown-to-HTML renderer.
 * Security: HTML-escapes all input FIRST, then applies markdown patterns.
 * Only our own markdown transforms produce HTML tags, so XSS is prevented.
 */
function renderMarkdown(text: string): string {
  // Step 1: HTML-escape ALL input to prevent XSS
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Step 2: Apply markdown patterns (only our safe transforms produce HTML)
  html = html
    // Code blocks (``` ... ```) — with optional language label header
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang: string, code: string) => {
      const header = lang
        ? `<div class="code-header"><span class="code-lang">${lang}</span><button class="code-copy" onclick="navigator.clipboard.writeText(this.closest('.code-block').querySelector('code').textContent)">Copy</button></div>`
        : `<div class="code-header"><button class="code-copy" onclick="navigator.clipboard.writeText(this.closest('.code-block').querySelector('code').textContent)">Copy</button></div>`;
      return `<div class="code-block">${header}<pre><code>${code}</code></pre></div>`;
    })
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Headings
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    // Bold + italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr/>')
    // Unordered lists
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>');

  // Wrap consecutive <li> in <ul>
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

  // Paragraphs: double newline = paragraph break
  html = html.replace(/\n\n+/g, '</p><p>');
  // Single newlines = line break
  html = html.replace(/\n/g, '<br/>');

  // Wrap in paragraph, clean up empty/misplaced tags
  html = `<p>${html}</p>`;
  html = html
    .replace(/<p><\/p>/g, '')
    .replace(/<p>(<h[234]>)/g, '$1')
    .replace(/(<\/h[234]>)<\/p>/g, '$1')
    .replace(/<p>(<pre>)/g, '$1')
    .replace(/(<\/pre>)<\/p>/g, '$1')
    .replace(/<p>(<div class="code-block">)/g, '$1')
    .replace(/(<\/div>)<\/p>/g, '$1')
    .replace(/<p>(<ul>)/g, '$1')
    .replace(/(<\/ul>)<\/p>/g, '$1')
    .replace(/<p>(<hr\/>)/g, '$1')
    .replace(/(<hr\/>)<\/p>/g, '$1');

  return html;
}

export function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelSelection | null>(null);
  const [lastModel, setLastModel] = useState('');
  const [activeMode, setActiveMode] = useState('auto');
  const [acIndex, setAcIndex] = useState(0);
  const [acOpen, setAcOpen] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentResponseRef = useRef('');
  const requestIdRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const acRef = useRef<HTMLDivElement>(null);
  const { data: status } = useApi(() => api.getStatus(), []);
  const { data: modelsData } = useApi(() => api.getModels(), []);

  // Load chat history from server on mount
  useEffect(() => {
    api.getSessionMessages().then(res => {
      if (res.data && res.data.length > 0) {
        setMessages(res.data.map(m => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })));
      }
      setHistoryLoaded(true);
    }).catch(() => {
      setHistoryLoaded(true);
    });
  }, []);

  // Detect mode changes from assistant messages
  useEffect(() => {
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role !== 'assistant') return;
    const modeMatch = last.content.match(/Switched to \*\*(\w+)\*\* mode/);
    if (modeMatch) {
      setActiveMode(modeMatch[1].toLowerCase());
      return;
    }
    if (last.content.includes('Mode set to **auto**')) {
      setActiveMode('auto');
      return;
    }
    if (last.content.includes('Modes disabled')) {
      setActiveMode('off');
    }
  }, [messages]);

  // Slash command autocomplete filtering
  const acMatches = useMemo(() => {
    if (!input.startsWith('/')) return [];
    const q = input.toLowerCase();
    return SLASH_COMMANDS.filter(c => c.command.startsWith(q));
  }, [input]);

  // Open/close autocomplete based on matches
  useEffect(() => {
    setAcOpen(acMatches.length > 0 && input.startsWith('/'));
    setAcIndex(0);
  }, [acMatches, input]);

  // Scroll selected item into view
  useEffect(() => {
    if (!acOpen || !acRef.current) return;
    const item = acRef.current.children[acIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [acIndex, acOpen]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = import.meta.env.DEV ? 'localhost:18800' : window.location.host;
    const ws = new WebSocket(`${protocol}//${host}/`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      setStreaming(false);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'connected':
          case 'auth_success':
            break;
          case 'chunk':
            currentResponseRef.current += msg.payload?.content ?? '';
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last?.role === 'assistant' && last.id === `resp-${requestIdRef.current}`) {
                return [...prev.slice(0, -1), { ...last, content: currentResponseRef.current }];
              }
              return [...prev, { id: `resp-${requestIdRef.current}`, role: 'assistant', content: currentResponseRef.current }];
            });
            break;
          case 'message':
            if (msg.payload?.role === 'assistant') {
              setMessages(prev => [...prev, {
                id: `msg-${Date.now()}`,
                role: 'assistant',
                content: msg.payload.content,
              }]);
            }
            break;
          case 'done': {
            setStreaming(false);
            const routing = msg.payload?.routing;
            if (routing) {
              const modelLabel = routing.model
                ? `${routing.provider}/${routing.model}`
                : routing.provider;
              setLastModel(modelLabel);
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === 'assistant') {
                  return [...prev.slice(0, -1), { ...last, model: modelLabel }];
                }
                return prev;
              });
            }
            currentResponseRef.current = '';
            break;
          }
          case 'error':
            setStreaming(false);
            currentResponseRef.current = '';
            setMessages(prev => [...prev, {
              id: `err-${Date.now()}`,
              role: 'error',
              content: msg.payload?.message ?? 'Unknown error',
            }]);
            break;
        }
      } catch {
        // ignore parse errors
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  // Build model options from providers data
  const providerGroups: Array<{ provider: string; displayName: string; models: string[] }> = [];
  if (modelsData?.providers) {
    for (const p of modelsData.providers) {
      if (p.available && p.models) {
        providerGroups.push({
          provider: p.name,
          displayName: p.displayName || p.name,
          models: Object.keys(p.models),
        });
      }
    }
  }

  const handleModelChange = (value: string) => {
    if (!value) {
      setSelectedModel(null);
      return;
    }
    const [provider, ...rest] = value.split('/');
    setSelectedModel({ provider, model: rest.join('/') });
  };

  const sendMessage = () => {
    if (!input.trim() || !wsRef.current || !connected || streaming) return;
    const content = input.trim();
    const id = ++requestIdRef.current;

    setMessages(prev => [...prev, { id: `user-${id}`, role: 'user', content }]);
    setInput('');
    setStreaming(true);
    currentResponseRef.current = '';

    const payload: Record<string, string> = { content };
    if (selectedModel) {
      payload.provider = selectedModel.provider;
      payload.model = selectedModel.model;
    }

    wsRef.current.send(JSON.stringify({
      type: 'message',
      id: String(id),
      payload,
    }));
  };

  const modeLabel = activeMode === 'auto' ? 'Auto' : activeMode === 'off' ? 'Off' : activeMode.charAt(0).toUpperCase() + activeMode.slice(1);

  return (
    <div className="page">
      <h2>Chat</h2>
      <div className="chat-container">
        <div className="chat-status">
          <span>
            {connected ? 'Connected' : 'Disconnected'}
            <span className="chat-mode-badge" title="Current personality mode">
              {modeLabel}
            </span>
          </span>
          <div className="model-selector">
            <select
              value={selectedModel ? `${selectedModel.provider}/${selectedModel.model}` : ''}
              onChange={e => handleModelChange(e.target.value)}
            >
              <option value="">Auto (router)</option>
              {providerGroups.map(g => (
                <optgroup key={g.provider} label={g.displayName}>
                  {g.models.map(m => (
                    <option key={`${g.provider}/${m}`} value={`${g.provider}/${m}`}>
                      {friendlyModelName(m)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>
        <div className="chat-messages">
          {!historyLoaded && (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>
              Loading...
            </div>
          )}
          {historyLoaded && messages.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>
              Send a message to start chatting
            </div>
          )}
          {messages.map(msg => (
            <div key={msg.id} className={`chat-message ${msg.role}`}>
              {msg.role === 'assistant'
                ? <div className="chat-markdown" dangerouslySetInnerHTML={{
                    // Safe: renderMarkdown HTML-escapes all input before applying
                    // markdown transforms — only our transforms produce HTML tags
                    __html: renderMarkdown(msg.content),
                  }} />
                : msg.content
              }
              {msg.model && (
                <div className="model-label">{msg.model}</div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
        <div className="chat-input-area">
          <div className="chat-input-wrapper">
            {acOpen && acMatches.length > 0 && (
              <div className="slash-autocomplete" ref={acRef}>
                {acMatches.map((cmd, i) => (
                  <div
                    key={cmd.command}
                    className={`slash-ac-item${i === acIndex ? ' selected' : ''}`}
                    onMouseEnter={() => setAcIndex(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setInput(cmd.command);
                      setAcOpen(false);
                      inputRef.current?.focus();
                    }}
                  >
                    <span className="slash-ac-cmd">{cmd.command}</span>
                    <span className="slash-ac-desc">{cmd.description}</span>
                  </div>
                ))}
              </div>
            )}
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (acOpen && acMatches.length > 0) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setAcIndex(i => (i + 1) % acMatches.length);
                    return;
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setAcIndex(i => (i - 1 + acMatches.length) % acMatches.length);
                    return;
                  }
                  if (e.key === 'Tab' || (e.key === 'Enter' && acMatches.length > 1)) {
                    e.preventDefault();
                    setInput(acMatches[acIndex].command);
                    setAcOpen(false);
                    return;
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setAcOpen(false);
                    return;
                  }
                }
                if (e.key === 'Enter') sendMessage();
              }}
              placeholder={connected ? 'Type / for commands...' : 'Connecting...'}
              disabled={!connected || streaming}
            />
          </div>
          <button onClick={sendMessage} disabled={!connected || streaming || !input.trim()}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
