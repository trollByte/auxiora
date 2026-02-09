import { useState, useEffect, useRef, useCallback } from 'react';
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

/** Turn a raw model ID into a friendly display name */
function friendlyModelName(id: string): string {
  if (id.startsWith('claude-opus-4'))   return 'Claude Opus 4';
  if (id.startsWith('claude-sonnet-4')) return 'Claude Sonnet 4';
  if (id.startsWith('claude-3-5-haiku'))return 'Claude Haiku 3.5';
  if (id.startsWith('claude-3-5-sonnet'))return 'Claude Sonnet 3.5';
  if (id.startsWith('claude-3-opus'))   return 'Claude Opus 3';
  if (id === 'gpt-4o')        return 'GPT-4o';
  if (id === 'gpt-4o-mini')   return 'GPT-4o Mini';
  if (id === 'gpt-4-turbo')   return 'GPT-4 Turbo';
  if (id.startsWith('o1'))    return id.toUpperCase();
  if (id.startsWith('o3'))    return id.toUpperCase();
  if (id.startsWith('gemini-'))return id.replace('gemini-', 'Gemini ');
  return id;
}

export function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelSelection | null>(null);
  const [lastModel, setLastModel] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentResponseRef = useRef('');
  const requestIdRef = useRef(0);
  const { data: status } = useApi(() => api.getStatus(), []);
  const { data: modelsData } = useApi(() => api.getModels(), []);

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
              // Annotate last assistant message with model info
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

  return (
    <div className="page">
      <h2>Chat</h2>
      <div className="chat-container">
        <div className="chat-status">
          <span>{connected ? 'Connected' : 'Disconnected'}</span>
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
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>
              Send a message to start chatting
            </div>
          )}
          {messages.map(msg => (
            <div key={msg.id} className={`chat-message ${msg.role}`}>
              {msg.content}
              {msg.model && (
                <div className="model-label">{msg.model}</div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
        <div className="chat-input-area">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(); }}
            placeholder={connected ? 'Type a message...' : 'Connecting...'}
            disabled={!connected || streaming}
          />
          <button onClick={sendMessage} disabled={!connected || streaming || !input.trim()}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
