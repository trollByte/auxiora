export interface WsMessage {
  type: string;
  id?: string;
  payload?: unknown;
}

export interface ClientConnection {
  id: string;
  ws: import('ws').WebSocket;
  authenticated: boolean;
  senderId?: string;
  channelType: string;
  lastActive: number;
  voiceActive?: boolean;
}
