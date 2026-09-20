import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createModels } from '@earendil-works/pi-ai';
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex';
import { kimiCodingProvider } from '@earendil-works/pi-ai/providers/kimi-coding';
import { DATA_DIRECTORY } from '../config.mjs';
import { atomicWrite } from '../storage.mjs';
import { statusError } from '../errors.mjs';

export function createOAuthService({
  path = join(DATA_DIRECTORY, 'ai-oauth.json'),
  providers = [openaiCodexProvider(), kimiCodingProvider()],
  timeoutMs = 15 * 60_000,
} = {}) {
  let queue = Promise.resolve();
  const serial = (fn) => {
    const result = queue.then(fn);
    queue = result.catch(() => {});
    return result;
  };
  const read = async () => {
    try {
      const data = JSON.parse(await readFile(path, 'utf8'));
      if (
        !data ||
        typeof data !== 'object' ||
        Array.isArray(data) ||
        Object.values(data).some(
          (entry) =>
            !entry ||
            entry.type !== 'oauth' ||
            typeof entry.access !== 'string' ||
            !entry.access ||
            typeof entry.refresh !== 'string' ||
            !entry.refresh ||
            !Number.isFinite(entry.expires),
        )
      )
        throw new Error('Invalid credential storage');
      return data;
    } catch (error) {
      if (error.code === 'ENOENT') return {};
      // JSON parse errors may quote credential file contents.
      throw statusError(500, '无法读取 OAuth 凭据文件，请检查服务器数据目录', { expose: true });
    }
  };
  const credentials = {
    read: (id) => serial(async () => (await read())[id]),
    list: () =>
      serial(async () =>
        Object.entries(await read()).map(([providerId, value]) => ({
          providerId,
          type: value.type,
        })),
      ),
    modify: (id, fn, options) =>
      serial(async () => {
        options?.signal?.throwIfAborted();
        const data = await read();
        const next = await fn(data[id]);
        options?.signal?.throwIfAborted();
        if (next !== undefined) {
          data[id] = next;
          await atomicWrite(path, JSON.stringify(data));
        }
        return data[id];
      }),
    delete: (id) =>
      serial(async () => {
        const data = await read();
        delete data[id];
        await atomicWrite(path, JSON.stringify(data));
      }),
  };
  const models = createModels({ credentials });
  for (const provider of providers) {
    // OAuth accounts must never silently fall back to an environment API key.
    models.setProvider({ ...provider, auth: { oauth: provider.auth.oauth } });
  }
  const sessions = new Map();
  const stopping = new Set();
  const providerFor = (id) => {
    const provider = providers.find((item) => item.id === id);
    if (!provider) throw statusError(400, '不支持的 OAuth 供应商');
    return provider;
  };
  const status = async (id) => {
    const provider = providerFor(id);
    const session = sessions.get(id);
    return {
      id,
      name: provider.name,
      connected: Boolean(await credentials.read(id)),
      models: provider.getModels().map((model) => model.id),
      login: session ? { state: session.state, ...session.public } : null,
    };
  };
  const cancel = async (id) => {
    providerFor(id);
    const session = sessions.get(id);
    if (session?.state === 'pending') {
      session.controller.abort();
      await session.done;
    }
    sessions.delete(id);
  };
  return {
    status,
    async list() {
      return Promise.all(providers.map((provider) => status(provider.id)));
    },
    async start(id) {
      providerFor(id);
      if (stopping.has(id) || sessions.get(id)?.state === 'pending')
        throw statusError(409, '授权正在进行中');
      const controller = new AbortController();
      const session = { controller, state: 'pending', public: {} };
      sessions.set(id, session);
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      timer.unref?.();
      session.done = models
        .login(id, 'oauth', {
          signal: controller.signal,
          prompt: async (prompt) => {
            if (
              prompt.type === 'select' &&
              prompt.options.some((option) => option.id === 'device_code')
            )
              return 'device_code';
            throw new Error('Unsupported login interaction');
          },
          notify: (event) => {
            if (event.type !== 'device_code' || controller.signal.aborted) return;
            const url = new URL(event.verificationUri);
            const hosts =
              id === 'openai-codex'
                ? ['auth.openai.com']
                : ['auth.kimi.com', 'www.kimi.com', 'kimi.com', 'www.kimi.ai', 'kimi.ai'];
            if (
              url.protocol !== 'https:' ||
              !hosts.includes(url.hostname) ||
              url.username ||
              url.password ||
              url.port
            )
              throw new Error('Invalid authorization URL');
            session.public = {
              userCode: event.userCode,
              url: url.href,
              expiresAt: Date.now() + (event.expiresInSeconds || 900) * 1000,
            };
          },
        })
        .then(() => {
          session.state = 'completed';
          session.public = {};
        })
        .catch(() => {
          session.state = 'failed';
          // SDK errors can contain token responses; never expose or log them.
          session.public = {
            message: controller.signal.aborted
              ? '授权已取消或超时，请重新登录。'
              : '授权失败，请重试；ChatGPT 账号请先在安全设置中启用设备码登录。',
          };
        })
        .finally(() => clearTimeout(timer));
      return status(id);
    },
    async cancel(id) {
      if (stopping.has(id)) throw statusError(409, '授权操作正在完成，请稍后重试');
      stopping.add(id);
      try {
        await cancel(id);
      } finally {
        stopping.delete(id);
      }
    },
    async logout(id) {
      if (stopping.has(id)) throw statusError(409, '授权操作正在完成，请稍后重试');
      stopping.add(id);
      try {
        await cancel(id);
        await models.logout(id);
        return await status(id);
      } finally {
        stopping.delete(id);
      }
    },
    async runtime(id, modelId, signal) {
      providerFor(id);
      if (!(await credentials.read(id)))
        throw statusError(400, '请先在设置页面登录所选 OAuth 供应商');
      const model = models.getModel(id, modelId);
      if (!model) throw statusError(400, '所选 OAuth 模型不可用，请选择该供应商支持的其他模型');
      try {
        await models.getAuth(id, { signal });
      } catch {
        signal?.throwIfAborted();
        throw statusError(400, '供应商授权刷新失败，请在设置中重新登录');
      }
      return { models, model };
    },
  };
}

export const oauthService = createOAuthService();
