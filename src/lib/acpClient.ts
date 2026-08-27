import type { AcpProvider } from '../types';

export type AcpStatus = 'unavailable' | 'disconnected' | 'connecting' | 'ready' | 'generating' | 'error';

export interface AcpSessionUpdate {
  sessionUpdate?: string;
  content?: { type?: string; text?: string };
  title?: string;
  status?: string;
  [key: string]: unknown;
}

export interface AcpBridgeMessage {
  type: 'status' | 'session-update' | 'turn-complete' | 'notice';
  status?: AcpStatus;
  provider?: AcpProvider;
  message?: string;
  update?: AcpSessionUpdate;
  stopReason?: string;
}

export function getAcpBridgeUrl() {
  const configured = import.meta.env.VITE_ACP_BRIDGE_URL as string | undefined;
  if (configured) return configured;
  if (!import.meta.env.DEV) return null;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/acp`;
}

export class AcpBridgeClient {
  private socket: WebSocket | null = null;

  constructor(private readonly onMessage: (message: AcpBridgeMessage) => void) {}

  connect(provider: AcpProvider) {
    const url = getAcpBridgeUrl();
    if (!url) {
      this.onMessage({ type: 'status', status: 'unavailable', message: '在线版本无法启动本地 CLI' });
      return;
    }
    this.disconnect();
    const socket = new WebSocket(url);
    let reportedError = false;
    this.socket = socket;
    this.onMessage({ type: 'status', status: 'connecting', provider });
    socket.addEventListener('open', () => socket.send(JSON.stringify({ type: 'connect', provider })));
    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(String(event.data)) as AcpBridgeMessage;
        if (message.status === 'error') reportedError = true;
        this.onMessage(message);
      } catch {
        reportedError = true;
        this.onMessage({ type: 'status', status: 'error', message: 'ACP 桥接返回了无法解析的数据' });
      }
    });
    socket.addEventListener('error', () => {
      reportedError = true;
      this.onMessage({ type: 'status', status: 'error', provider, message: '无法连接本地 ACP 桥接服务' });
    });
    socket.addEventListener('close', () => {
      if (this.socket === socket) {
        this.socket = null;
        if (!reportedError) this.onMessage({ type: 'status', status: 'disconnected', provider });
      }
    });
  }

  prompt(content: string) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ type: 'prompt', content }));
    return true;
  }

  cancel() {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'cancel' }));
  }

  disconnect() {
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'disconnect' }));
    socket.close();
  }
}
