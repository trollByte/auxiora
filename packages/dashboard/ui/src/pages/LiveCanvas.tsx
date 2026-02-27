import { useState, useEffect, useRef, useCallback } from 'react';

interface CanvasObject {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  content?: string;
  src?: string;
  alt?: string;
  [key: string]: unknown;
}

interface CanvasSession {
  id: string;
  name?: string;
  createdAt?: string;
}

type WsEvent =
  | { type: 'canvas:snapshot'; objects: CanvasObject[] }
  | { type: 'object:added'; object: CanvasObject }
  | { type: 'object:updated'; object: CanvasObject }
  | { type: 'object:removed'; id: string }
  | { type: 'canvas:cleared' };

export function LiveCanvas() {
  const [sessions, setSessions] = useState<CanvasSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [objects, setObjects] = useState<Map<string, CanvasObject>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/v1/canvas/sessions');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSessions(Array.isArray(data) ? data : data.sessions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSessions();
  }, [fetchSessions]);

  const connectToSession = useCallback((sessionId: string) => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setSelectedSession(sessionId);
    setObjects(new Map());
    setConnected(false);

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${window.location.host}/api/v1/canvas/sessions/${sessionId}/ws`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.addEventListener('open', () => setConnected(true));
    ws.addEventListener('close', () => setConnected(false));
    ws.addEventListener('error', () => setConnected(false));

    ws.addEventListener('message', (ev) => {
      let event: WsEvent;
      try {
        event = JSON.parse(String(ev.data)) as WsEvent;
      } catch {
        return;
      }

      switch (event.type) {
        case 'canvas:snapshot':
          setObjects(new Map(event.objects.map(o => [o.id, o])));
          break;
        case 'object:added':
        case 'object:updated':
          setObjects(prev => {
            const next = new Map(prev);
            next.set(event.object.id, event.object);
            return next;
          });
          break;
        case 'object:removed':
          setObjects(prev => {
            const next = new Map(prev);
            next.delete(event.id);
            return next;
          });
          break;
        case 'canvas:cleared':
          setObjects(new Map());
          break;
      }
    });
  }, []);

  const goBack = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setSelectedSession(null);
    setConnected(false);
    setObjects(new Map());
    void fetchSessions();
  }, [fetchSessions]);

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  if (selectedSession) {
    const visibleObjects = Array.from(objects.values()).filter(o => o.visible !== false);
    return (
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <button className="btn btn-sm" onClick={goBack}>Back</button>
          <span style={{ fontWeight: 600 }}>Session: {selectedSession}</span>
          <span className={`lc-status ${connected ? 'lc-connected' : 'lc-disconnected'}`}>
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        <div className="lc-canvas" style={{ position: 'relative', minHeight: 400 }}>
          {visibleObjects.length === 0 && (
            <p className="lc-empty" style={{ textAlign: 'center' }}>No objects on canvas</p>
          )}
          {visibleObjects.map(obj => (
            <div
              key={obj.id}
              className="lc-obj"
              style={{
                position: 'absolute',
                left: obj.x,
                top: obj.y,
                width: obj.width,
                height: obj.height,
              }}
            >
              {obj.type === 'text' && (
                <div className="lc-text">{obj.content ?? ''}</div>
              )}
              {obj.type === 'image' && (
                <img
                  className="lc-image"
                  src={obj.src}
                  alt={obj.alt ?? ''}
                  style={{ width: '100%', height: '100%' }}
                />
              )}
              {obj.type === 'widget' && (
                <div className="lc-text">{obj.content ?? `[widget ${obj.id}]`}</div>
              )}
              {obj.type !== 'text' && obj.type !== 'image' && obj.type !== 'widget' && (
                <div className="lc-text">[{obj.type}]</div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ marginBottom: 12 }}>Canvas Sessions</h2>
      {loading && <p className="lc-empty">Loading sessions...</p>}
      {error && <p style={{ color: 'var(--error)' }}>{error}</p>}
      {!loading && !error && sessions.length === 0 && (
        <p className="lc-empty">No canvas sessions available</p>
      )}
      {!loading && sessions.length > 0 && (
        <div className="lc-sessions">
          {sessions.map(s => (
            <button key={s.id} className="btn" onClick={() => connectToSession(s.id)}>
              {s.name ?? s.id}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
