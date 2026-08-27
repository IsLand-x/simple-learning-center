import { spawn } from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import * as acp from '@agentclientprotocol/sdk';
import { WebSocketServer } from 'ws';

const HOST = '127.0.0.1';
const PORT = Number(process.env.LEARNING_CENTER_ACP_PORT || 4312);
const WORKSPACE = process.cwd();

const providerCommands = {
  codex: {
    command: process.env.LEARNING_CENTER_CODEX_ACP_COMMAND || (process.platform === 'win32' ? 'npx.cmd' : 'npx'),
    args: parseArgs(process.env.LEARNING_CENTER_CODEX_ACP_ARGS, ['--yes', '@zed-industries/codex-acp']),
  },
  kimi: {
    command: process.env.LEARNING_CENTER_KIMI_ACP_COMMAND || (process.platform === 'win32' ? 'kimi.exe' : 'kimi'),
    args: parseArgs(process.env.LEARNING_CENTER_KIMI_ACP_ARGS, ['acp']),
  },
};

function parseArgs(value, fallback) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string') ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return (url.hostname === '127.0.0.1' || url.hostname === 'localhost') && (url.protocol === 'http:' || url.protocol === 'https:');
  } catch {
    return false;
  }
}

function send(socket, payload) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload));
}

function safeError(error) {
  if (error instanceof Error) return error.message;
  return String(error || '未知错误');
}

class LearningCenterClient {
  constructor(socket) {
    this.socket = socket;
  }

  async requestPermission(params) {
    const rejection = params.options.find((option) => option.kind === 'reject_once' || option.kind === 'reject_always');
    send(this.socket, {
      type: 'notice',
      message: `为保护本地文件，阅读器已拒绝工具操作：${params.toolCall.title || '未命名操作'}`,
    });
    return rejection
      ? { outcome: { outcome: 'selected', optionId: rejection.optionId } }
      : { outcome: { outcome: 'cancelled' } };
  }

  async sessionUpdate(params) {
    send(this.socket, { type: 'session-update', update: params.update });
  }
}

const server = new WebSocketServer({
  host: HOST,
  port: PORT,
  path: '/acp',
  verifyClient: ({ origin }, done) => done(isAllowedOrigin(origin), isAllowedOrigin(origin) ? 200 : 403, 'Local origins only'),
});

server.on('connection', (socket) => {
  let child = null;
  let connection = null;
  let sessionId = null;
  let provider = null;
  let currentPrompt = null;
  let stderrTail = '';

  const cleanup = () => {
    if (child && !child.killed) child.kill('SIGTERM');
    child = null;
    connection = null;
    sessionId = null;
    currentPrompt = null;
  };

  const connect = async (nextProvider) => {
    cleanup();
    provider = nextProvider;
    const config = providerCommands[nextProvider];
    if (!config) throw new Error('不支持的 ACP 提供方');

    send(socket, { type: 'status', status: 'connecting', provider });
    child = spawn(config.command, config.args, {
      cwd: WORKSPACE,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderrTail = `${stderrTail}${chunk}`.slice(-4000);
    });
    child.on('error', (error) => {
      send(socket, { type: 'status', status: 'error', provider, message: safeError(error) });
    });
    child.on('exit', (code, signal) => {
      if (connection) {
        send(socket, {
          type: 'status',
          status: 'error',
          provider,
          message: stderrTail.trim() || `ACP 进程已退出（${signal || code || 'unknown'}）`,
        });
      }
      connection = null;
      sessionId = null;
    });

    const stream = acp.ndJsonStream(
      Writable.toWeb(child.stdin),
      Readable.toWeb(child.stdout),
    );
    const client = new LearningCenterClient(socket);
    connection = new acp.ClientSideConnection(() => client, stream);
    const initialized = await connection.initialize({
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: {},
    });
    const session = await connection.newSession({ cwd: WORKSPACE, mcpServers: [] });
    sessionId = session.sessionId;
    send(socket, {
      type: 'status',
      status: 'ready',
      provider,
      sessionId,
      protocolVersion: initialized.protocolVersion,
    });
  };

  const prompt = async (content) => {
    if (!connection || !sessionId) throw new Error('请先连接本地 ACP 助手');
    if (currentPrompt) throw new Error('上一条消息仍在生成中');
    send(socket, { type: 'status', status: 'generating', provider, sessionId });
    currentPrompt = connection.prompt({
      sessionId,
      prompt: [{ type: 'text', text: content }],
    });
    try {
      const result = await currentPrompt;
      send(socket, { type: 'turn-complete', stopReason: result.stopReason });
      send(socket, { type: 'status', status: 'ready', provider, sessionId });
    } finally {
      currentPrompt = null;
    }
  };

  socket.on('message', async (raw) => {
    try {
      const message = JSON.parse(raw.toString());
      if (message.type === 'connect') {
        await connect(message.provider);
        return;
      }
      if (message.type === 'prompt') {
        await prompt(String(message.content || '').trim());
        return;
      }
      if (message.type === 'cancel' && connection && sessionId) {
        await connection.cancel({ sessionId });
        return;
      }
      if (message.type === 'disconnect') {
        cleanup();
        send(socket, { type: 'status', status: 'disconnected', provider });
      }
    } catch (error) {
      send(socket, { type: 'status', status: 'error', provider, message: safeError(error) });
    }
  });

  socket.on('close', cleanup);
  socket.on('error', cleanup);
  send(socket, { type: 'status', status: 'disconnected' });
});

server.on('listening', () => {
  process.stdout.write(`Learning Center ACP bridge listening on ws://${HOST}:${PORT}/acp\n`);
});

const shutdown = () => {
  server.clients.forEach((socket) => socket.close(1001, 'Server shutting down'));
  server.close(() => process.exit(0));
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
