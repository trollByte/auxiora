import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../api';
import type { TaskContext, TraitSource, ContextDomain, ContextRecommendation } from '@auxiora/personality/architect';
import { ContextIndicator } from '../components/ContextIndicator.js';
import { SourcesButton } from '../components/SourcesButton.js';
import { ContextOverrideMenu } from '../components/ContextOverrideMenu.js';
import { ContextRecommendation as ContextRecommendationBanner } from '../components/ContextRecommendation.js';
import { DOMAIN_META } from '../components/context-meta.js';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'error';
  content: string;
  model?: string;
  detectedContext?: TaskContext;
  activeTraits?: TraitSource[];
  traitWeights?: Record<string, number>;
  recommendation?: ContextRecommendation;
  /** The user message that triggered this response (for correction recording). */
  userMessage?: string;
}

interface ChatThread {
  id: string;
  title: string;
  updatedAt: number;
  personality?: string;
}

interface ModelSelection {
  provider: string;
  model: string;
}

interface SlashCommand {
  command: string;
  description: string;
}

interface ContextMenuState {
  chatId: string;
  x: number;
  y: number;
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
  if (id.startsWith('claude-opus-4-6'))      return 'Claude Opus 4.6';
  if (id.startsWith('claude-sonnet-4-5'))    return 'Claude Sonnet 4.5';
  if (id.startsWith('claude-haiku-4-5'))     return 'Claude Haiku 4.5';
  if (id.startsWith('claude-opus-4'))        return 'Claude Opus 4';
  if (id.startsWith('claude-sonnet-4'))      return 'Claude Sonnet 4';
  if (id.startsWith('claude-3-5-haiku'))     return 'Claude Haiku 3.5';
  if (id.startsWith('claude-3-5-sonnet'))    return 'Claude Sonnet 3.5';
  if (id.startsWith('claude-3-opus'))        return 'Claude Opus 3';
  if (id === 'gpt-4o')        return 'GPT-4o';
  if (id === 'gpt-4o-mini')   return 'GPT-4o Mini';
  if (id === 'gpt-4-turbo')   return 'GPT-4 Turbo';
  if (id.startsWith('o1'))    return id.toUpperCase();
  if (id.startsWith('o3'))    return id.toUpperCase();
  if (id.startsWith('gemini-'))return id.replace('gemini-', 'Gemini ');
  return id;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

/**
 * Lightweight markdown-to-HTML renderer.
 * Security: HTML-escapes all input FIRST, then applies markdown patterns.
 * Only our own markdown transforms produce HTML tags, so XSS is prevented.
 */
function renderMarkdown(text: string): string {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  html = html
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang: string, code: string) => {
      const header = lang
        ? `<div class="code-header"><span class="code-lang">${lang}</span><button class="code-copy" onclick="navigator.clipboard.writeText(this.closest('.code-block').querySelector('code').textContent)">Copy</button></div>`
        : `<div class="code-header"><button class="code-copy" onclick="navigator.clipboard.writeText(this.closest('.code-block').querySelector('code').textContent)">Copy</button></div>`;
      return `<div class="code-block">${header}<pre><code>${code}</code></pre></div>`;
    })
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^---$/gm, '<hr/>')
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>');

  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
  html = html.replace(/\n\n+/g, '</p><p>');
  html = html.replace(/\n/g, '<br/>');

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
  const [toolStatus, setToolStatus] = useState('');
  const [selectedModel, setSelectedModel] = useState<ModelSelection | null>(null);
  const [lastModel, setLastModel] = useState('');
  const [activeMode, setActiveMode] = useState('auto');
  const [acIndex, setAcIndex] = useState(0);
  const [acOpen, setAcOpen] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // Multi-chat state
  const [chats, setChats] = useState<ChatThread[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Per-chat personality state
  const [chatPersonality, setChatPersonality] = useState<string | undefined>(undefined);
  const [globalEngine, setGlobalEngine] = useState<string>('standard');

  // Architect personality state
  const [overrideMenuOpenForMessageId, setOverrideMenuOpenForMessageId] = useState<string | null>(null);
  const [conversationContextOverride, setConversationContextOverride] = useState<ContextDomain | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const currentResponseRef = useRef('');
  const requestIdRef = useRef(0);
  const activeRequestIdRef = useRef(0); // tracks which requestId the UI should render
  const inputRef = useRef<HTMLInputElement>(null);
  const acRef = useRef<HTMLDivElement>(null);
  const chatIdRef = useRef<string | null>(null);
  const { data: status } = useApi(() => api.getStatus(), []);
  const { data: modelsData } = useApi(() => api.getModels(), []);
  const { data: identityData } = useApi(() => api.getIdentity(), []);
  const { data: personalityData } = useApi(() => api.getPersonality(), []);

  // Keep chatIdRef in sync
  useEffect(() => {
    chatIdRef.current = chatId;
  }, [chatId]);

  // Load global personality engine on mount
  useEffect(() => {
    api.getPersonalityEngine().then(res => {
      if (res.data?.engine) setGlobalEngine(res.data.engine);
    }).catch(() => {});
  }, []);

  // Load chat list on mount — auto-create first chat if none exist
  useEffect(() => {
    api.getChats().then(async res => {
      if (res.data && res.data.length > 0) {
        setChats(res.data.map((c: any) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt, personality: c.metadata?.personality })));
        setChatId(res.data[0].id);
      } else {
        // No chats yet — create one automatically
        const newRes = await api.createNewChat();
        const c = newRes.data;
        setChats([{ id: c.id, title: c.title, updatedAt: c.updatedAt }]);
        setChatId(c.id);
        setHistoryLoaded(true);
      }
    }).catch(() => {});
  }, []);

  // Sync per-chat personality when chatId changes
  useEffect(() => {
    if (!chatId) {
      setChatPersonality(undefined);
      return;
    }
    const chat = chats.find(c => c.id === chatId);
    setChatPersonality(chat?.personality);
  }, [chatId, chats]);

  // Load messages when chatId changes
  useEffect(() => {
    // Detach any in-flight streaming request so its chunks/done are ignored
    if (streaming) {
      activeRequestIdRef.current = 0;
      setStreaming(false);
      currentResponseRef.current = '';
    }
    if (!chatId) {
      setMessages([]);
      setHistoryLoaded(true);
      return;
    }
    setHistoryLoaded(false);
    api.getChatMessages(chatId).then(res => {
      if (res.data) {
        setMessages(res.data.map(m => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })));
      } else {
        setMessages([]);
      }
      setHistoryLoaded(true);
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView();
      });
    }).catch(() => {
      setMessages([]);
      setHistoryLoaded(true);
    });
  }, [chatId]);

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

  useEffect(() => {
    setAcOpen(acMatches.length > 0 && input.startsWith('/'));
    setAcIndex(0);
  }, [acMatches, input]);

  useEffect(() => {
    if (!acOpen || !acRef.current) return;
    const item = acRef.current.children[acIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [acIndex, acOpen]);

  const scrollToBottom = useCallback(() => {
    if (isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  // Track whether the user is near the bottom of the messages container
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const threshold = 80;
      isNearBottomRef.current =
        container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [contextMenu]);

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
            setToolStatus(''); // Clear any lingering tool/status indicators
            // Ignore chunks for detached requests (user switched chats)
            if (requestIdRef.current !== activeRequestIdRef.current) break;
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last?.role === 'assistant' && last.id === `resp-${activeRequestIdRef.current}`) {
                return [...prev.slice(0, -1), { ...last, content: currentResponseRef.current }];
              }
              return [...prev, { id: `resp-${activeRequestIdRef.current}`, role: 'assistant', content: currentResponseRef.current }];
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
          case 'tool_use': {
            const toolName = msg.payload?.tool ?? 'tool';
            const params = msg.payload?.params;
            const friendlyNames: Record<string, string> = {
              web_browser: 'Reading web page',
              browser_navigate: 'Navigating browser',
              browser_click: 'Clicking element',
              browser_type: 'Typing text',
              browser_screenshot: 'Taking screenshot',
              browser_extract: 'Extracting data',
              browse: 'Browsing',
              bash: 'Running command',
              file_read: 'Reading file',
              file_write: 'Writing file',
              file_list: 'Listing files',
            };
            let status = friendlyNames[toolName] || `Using ${toolName}`;
            // Show command details for bash and URL for web tools
            if (toolName === 'bash' && params?.command) {
              const cmd = String(params.command);
              status = `Running: ${cmd.length > 60 ? cmd.slice(0, 57) + '...' : cmd}`;
            } else if ((toolName === 'web_browser' || toolName === 'browse') && params?.url) {
              try {
                const hostname = new URL(String(params.url)).hostname;
                status = `Reading ${hostname}`;
              } catch { /* keep default */ }
            } else if (toolName === 'file_read' && params?.path) {
              const filename = String(params.path).split('/').pop();
              status = `Reading ${filename}`;
            }
            setToolStatus(status);
            break;
          }
          case 'tool_result':
            setToolStatus('');
            break;
          case 'status':
            setToolStatus(msg.payload?.message ?? 'Processing');
            break;
          case 'done': {
            setStreaming(false);
            setToolStatus('');
            currentResponseRef.current = '';
            // Ignore done for detached requests (user switched chats)
            if (requestIdRef.current !== activeRequestIdRef.current) break;
            const routing = msg.payload?.routing;
            const architect = msg.payload?.architect;
            const updates: Partial<ChatMessage> = {};
            if (routing) {
              const modelLabel = routing.model
                ? `${routing.provider}/${routing.model}`
                : routing.provider;
              setLastModel(modelLabel);
              updates.model = modelLabel;
            }
            if (architect) {
              updates.detectedContext = architect.detectedContext;
              updates.activeTraits = architect.activeTraits;
              updates.traitWeights = architect.traitWeights;
              updates.recommendation = architect.recommendation;
            }
            if (Object.keys(updates).length > 0) {
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === 'assistant') {
                  // Link the preceding user message for correction recording
                  const userMsg = prev.slice(0, -1).reverse().find(m => m.role === 'user');
                  if (userMsg) updates.userMessage = userMsg.content;
                  return [...prev.slice(0, -1), { ...last, ...updates }];
                }
                return prev;
              });
            }
            break;
          }
          case 'chat_created':
            // Server created a new chat for this message
            if (msg.payload?.chatId) {
              setChatId(msg.payload.chatId);
              // Refresh chat list
              api.getChats().then(res => {
                if (res.data) {
                  setChats(res.data.map((c: any) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt })));
                }
              }).catch(() => {});
            }
            break;
          case 'chat_titled':
            // Server auto-titled a chat
            if (msg.payload?.chatId && msg.payload?.title) {
              setChats(prev => prev.map(c =>
                c.id === msg.payload.chatId ? { ...c, title: msg.payload.title } : c
              ));
            }
            break;
          case 'error':
            setStreaming(false);
            setToolStatus('');
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
    if (!input.trim() || !wsRef.current || !connected) return;
    const content = input.trim();
    const id = ++requestIdRef.current;
    activeRequestIdRef.current = id;

    setMessages(prev => [...prev, { id: `user-${id}`, role: 'user', content }]);
    setInput('');
    setStreaming(true);
    currentResponseRef.current = '';
    isNearBottomRef.current = true;

    const payload: Record<string, string> = { content };
    if (selectedModel) {
      payload.provider = selectedModel.provider;
      payload.model = selectedModel.model;
    }
    if (chatIdRef.current) {
      payload.chatId = chatIdRef.current;
    }

    wsRef.current.send(JSON.stringify({
      type: 'message',
      id: String(id),
      payload,
    }));
  };

  const handleContextOverride = useCallback((domain: ContextDomain, scope: 'message' | 'conversation', messageId: string) => {
    setOverrideMenuOpenForMessageId(null);
    if (scope === 'conversation') {
      setConversationContextOverride(domain);
      // Send override command so runtime uses it for subsequent messages
      if (wsRef.current && connected) {
        wsRef.current.send(JSON.stringify({
          type: 'message',
          id: String(++requestIdRef.current),
          payload: {
            content: `/context-override ${domain}`,
            chatId: chatIdRef.current,
          },
        }));
      }
    }
    // Record correction for the learning engine
    setMessages(prev => {
      const msg = prev.find(m => m.id === messageId);
      if (msg?.detectedContext && msg.userMessage && msg.detectedContext.domain !== domain) {
        if (wsRef.current && connected) {
          wsRef.current.send(JSON.stringify({
            type: 'architect_correction',
            payload: {
              userMessage: msg.userMessage,
              detectedDomain: msg.detectedContext.domain,
              correctedDomain: domain,
            },
          }));
        }
      }
      // Update the displayed context on the message
      return prev.map(m =>
        m.id === messageId && m.detectedContext
          ? { ...m, detectedContext: { ...m.detectedContext, domain }, recommendation: undefined }
          : m
      );
    });
  }, [connected]);

  const handleRecommendationAccept = useCallback((messageId: string, domain: ContextDomain) => {
    // Treat as a context override + record correction
    setMessages(prev => {
      const msg = prev.find(m => m.id === messageId);
      if (msg?.detectedContext && msg.userMessage && msg.detectedContext.domain !== domain) {
        if (wsRef.current && connected) {
          wsRef.current.send(JSON.stringify({
            type: 'architect_correction',
            payload: {
              userMessage: msg.userMessage,
              detectedDomain: msg.detectedContext.domain,
              correctedDomain: domain,
            },
          }));
        }
      }
      return prev.map(m =>
        m.id === messageId
          ? { ...m, detectedContext: m.detectedContext ? { ...m.detectedContext, domain } : m.detectedContext, recommendation: undefined }
          : m
      );
    });
  }, [connected]);

  const handleRecommendationDismiss = useCallback((messageId: string) => {
    // Neutral signal — just hide the recommendation
    setMessages(prev => prev.map(m =>
      m.id === messageId ? { ...m, recommendation: undefined } : m
    ));
  }, []);

  const clearConversationOverride = useCallback(() => {
    setConversationContextOverride(null);
    if (wsRef.current && connected) {
      wsRef.current.send(JSON.stringify({
        type: 'message',
        id: String(++requestIdRef.current),
        payload: {
          content: '/context-override clear',
          chatId: chatIdRef.current,
        },
      }));
    }
  }, [connected]);

  const handleChatPersonalityChange = useCallback(async (value: string) => {
    if (!chatId) return;
    const personality = value || undefined; // empty string = use global default
    try {
      await api.updateChatPersonality(chatId, value || 'standard');
      setChatPersonality(personality);
      setChats(prev => prev.map(c => c.id === chatId ? { ...c, personality } : c));
    } catch {
      // ignore
    }
  }, [chatId]);

  const handleNewChat = async () => {
    try {
      const res = await api.createNewChat();
      const newChat = res.data;
      setChats(prev => [{ id: newChat.id, title: newChat.title, updatedAt: newChat.updatedAt }, ...prev]);
      setChatId(newChat.id);
      setMessages([]);
      setConversationContextOverride(null);
      setOverrideMenuOpenForMessageId(null);
      setHistoryLoaded(true);
      inputRef.current?.focus();
    } catch {
      // ignore
    }
  };

  const handleRenameSubmit = async (id: string) => {
    if (!editTitle.trim()) {
      setEditingChatId(null);
      return;
    }
    try {
      await api.renameChat(id, editTitle.trim());
      setChats(prev => prev.map(c => c.id === id ? { ...c, title: editTitle.trim() } : c));
    } catch {
      // ignore
    }
    setEditingChatId(null);
  };

  const handleDeleteChat = async (id: string) => {
    try {
      await api.deleteChatThread(id);
      setChats(prev => prev.filter(c => c.id !== id));
      if (chatId === id) {
        setChatId(null);
        setMessages([]);
      }
    } catch {
      // ignore
    }
    setContextMenu(null);
  };

  const handleArchiveChat = async (id: string) => {
    try {
      await api.archiveChat(id);
      setChats(prev => prev.filter(c => c.id !== id));
      if (chatId === id) {
        setChatId(null);
        setMessages([]);
      }
    } catch {
      // ignore
    }
    setContextMenu(null);
  };

  const modeLabel = activeMode === 'auto' ? 'Auto' : activeMode === 'off' ? 'Off' : activeMode.charAt(0).toUpperCase() + activeMode.slice(1);
  const agentName = identityData?.data?.name ?? 'Auxiora';
  const templateName = personalityData?.data?.template?.name ?? null;

  // renderMarkdown already HTML-escapes all input before applying transforms,
  // so only our safe markdown patterns produce HTML tags (no XSS risk).
  const renderMessageHtml = (content: string) => ({ __html: renderMarkdown(content) });

  return (
    <div className="page">
      <h2>Chat</h2>
      <div className="chat-layout">
        {/* Sidebar */}
        <div className={`chat-sidebar${sidebarOpen ? '' : ' closed'}`}>
          <div className="chat-sidebar-header">
            <button className="new-chat-btn" onClick={handleNewChat}>+ New Chat</button>
            <button
              className="sidebar-toggle"
              onClick={() => setSidebarOpen(v => !v)}
              title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            >
              {sidebarOpen ? '\u00AB' : '\u00BB'}
            </button>
          </div>
          {sidebarOpen && (
            <div className="chat-sidebar-list">
              {chats.map(c => (
                <div
                  key={c.id}
                  className={`chat-sidebar-item${chatId === c.id ? ' active' : ''}`}
                  onClick={() => {
                    if (editingChatId !== c.id) {
                      setChatId(c.id);
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ chatId: c.id, x: e.clientX, y: e.clientY });
                  }}
                >
                  {editingChatId === c.id ? (
                    <input
                      className="chat-rename-input"
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleRenameSubmit(c.id);
                        if (e.key === 'Escape') setEditingChatId(null);
                      }}
                      onBlur={() => handleRenameSubmit(c.id)}
                      autoFocus
                    />
                  ) : (
                    <>
                      <span className="chat-sidebar-title">{c.title}</span>
                      <span className="chat-sidebar-time">{formatRelativeTime(c.updatedAt)}</span>
                    </>
                  )}
                </div>
              ))}
              {chats.length === 0 && (
                <div className="chat-sidebar-empty">No chats yet</div>
              )}
            </div>
          )}
        </div>

        {/* Context Menu */}
        {contextMenu && (
          <div
            className="chat-context-menu"
            style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x }}
          >
            <button onClick={() => {
              const chat = chats.find(c => c.id === contextMenu.chatId);
              setEditTitle(chat?.title ?? '');
              setEditingChatId(contextMenu.chatId);
              setContextMenu(null);
            }}>Rename</button>
            <button onClick={() => handleArchiveChat(contextMenu.chatId)}>Archive</button>
            <button className="danger" onClick={() => handleDeleteChat(contextMenu.chatId)}>Delete</button>
          </div>
        )}

        {/* Chat area */}
        <div className="chat-container">
          <div className="chat-status">
            <span className="chat-status-left">
              <span className="chat-status-dot" data-connected={connected} />
              <span className="chat-agent-name">{agentName}</span>
              <span className="chat-status-sep" />
              <span className="chat-status-label">Mode: <strong>{modeLabel}</strong></span>
              <span className="chat-status-sep" />
              <span className="chat-status-label">
                Engine:{' '}
                <select
                  className="chat-personality-select"
                  value={chatPersonality ?? ''}
                  onChange={e => handleChatPersonalityChange(e.target.value)}
                  title="Per-chat personality engine"
                >
                  <option value="">Global ({globalEngine === 'the-architect' ? 'Architect' : 'Standard'})</option>
                  <option value="standard">Standard</option>
                  <option value="the-architect">The Architect</option>
                </select>
              </span>
              {templateName && (
                <>
                  <span className="chat-status-sep" />
                  <span className="chat-status-label">Personality: <strong>{templateName}</strong></span>
                </>
              )}
            </span>
            <span className="chat-status-right">
              <button
                className="sidebar-toggle-inline"
                onClick={() => setSidebarOpen(v => !v)}
                title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
              >
                {sidebarOpen ? '\u2630' : '\u2630'}
              </button>
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
            </span>
          </div>
          <div className="chat-messages" ref={messagesContainerRef}>
            {!chatId && (
              <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>
                Select a chat or create a new one
              </div>
            )}
            {chatId && !historyLoaded && (
              <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>
                Loading...
              </div>
            )}
            {chatId && historyLoaded && messages.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>
                Send a message to start chatting
              </div>
            )}
            {conversationContextOverride && (
              <div className="context-override-banner">
                <span>
                  Context locked to {DOMAIN_META[conversationContextOverride]?.icon ?? '🔒'}{' '}
                  {DOMAIN_META[conversationContextOverride]?.label ?? conversationContextOverride}
                </span>
                <button
                  className="context-override-unlock"
                  onClick={clearConversationOverride}
                  aria-label="Clear context override"
                >
                  Tap to unlock
                </button>
              </div>
            )}
            {messages.map(msg => (
              <div key={msg.id} className={`chat-message ${msg.role}`}>
                {msg.role === 'assistant' && msg.detectedContext && (
                  <div className="chat-context-row">
                    <ContextIndicator
                      context={msg.detectedContext}
                      onOverride={(domain) => handleContextOverride(domain, 'message', msg.id)}
                    />
                    <button
                      className="context-override-trigger"
                      onClick={() => setOverrideMenuOpenForMessageId(
                        overrideMenuOpenForMessageId === msg.id ? null : msg.id,
                      )}
                      aria-label="Override context"
                    >
                      ✎
                    </button>
                    <ContextOverrideMenu
                      isOpen={overrideMenuOpenForMessageId === msg.id}
                      currentDomain={msg.detectedContext.domain}
                      onSelect={(domain, scope) => handleContextOverride(domain, scope, msg.id)}
                      onClose={() => setOverrideMenuOpenForMessageId(null)}
                    />
                  </div>
                )}
                {msg.role === 'assistant' && msg.recommendation && (
                  <ContextRecommendationBanner
                    recommendation={msg.recommendation}
                    onAccept={(domain) => handleRecommendationAccept(msg.id, domain)}
                    onDismiss={() => handleRecommendationDismiss(msg.id)}
                  />
                )}
                {msg.role === 'assistant'
                  ? <div className="chat-markdown" dangerouslySetInnerHTML={renderMessageHtml(msg.content)} /> /* pre-sanitized by renderMarkdown */
                  : msg.content
                }
                {msg.role === 'assistant' && msg.activeTraits && msg.activeTraits.length > 0 && (
                  <SourcesButton
                    sources={msg.activeTraits}
                    context={msg.detectedContext!}
                    weights={msg.traitWeights}
                  />
                )}
                {msg.model && (
                  <div className="model-label">{msg.model}</div>
                )}
              </div>
            ))}
            {(streaming && toolStatus) && (
              <div className="chat-tool-status">
                <span className="tool-status-dot" />
                {toolStatus}...
              </div>
            )}
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
                placeholder={!chatId ? 'Select or create a chat...' : connected ? 'Type / for commands...' : 'Connecting...'}
                disabled={!connected || !chatId}
              />
            </div>
            <button onClick={sendMessage} disabled={!connected || !input.trim() || !chatId}>
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
