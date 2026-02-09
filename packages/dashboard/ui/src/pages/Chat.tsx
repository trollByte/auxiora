import { useState, useEffect, useRef, useCallback } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../api';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'error';
  content: string;
}

export function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentResponseRef = useRef('');
  const requestIdRef = useRef(0);
  const { data: status } = useApi(() => api.getStatus(), []);

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
          case 'done':
            setStreaming(false);
            currentResponseRef.current = '';
            break;
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

  const sendMessage = () => {
    if (!input.trim() || !wsRef.current || !connected || streaming) return;
    const content = input.trim();
    const id = ++requestIdRef.current;

    setMessages(prev => [...prev, { id: `user-${id}`, role: 'user', content }]);
    setInput('');
    setStreaming(true);
    currentResponseRef.current = '';

    wsRef.current.send(JSON.stringify({
      type: 'message',
      id: String(id),
      payload: { content },
    }));
  };

  return (
    <div className="page">
      <h2>Chat</h2>
      <div className="chat-container">
        <div className="chat-status">
          <span>{connected ? 'Connected' : 'Disconnected'}</span>
          {status?.data?.activeModel && (
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
              {status.data.activeModel.model}
            </span>
          )}
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
