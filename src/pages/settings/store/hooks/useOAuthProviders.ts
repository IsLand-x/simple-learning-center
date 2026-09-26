import { useCallback, useEffect, useRef, useState } from 'react';
import { serverRequest } from '../../../../util/api/serverApi';
import { useLearningStore } from '../../../../util/state/useLearningStore';
import type { OpenAICompatibleConfig } from '../../../../util/types';

type ProviderId = NonNullable<OpenAICompatibleConfig['oauthProvider']>;
interface ProviderStatus {
  id: ProviderId;
  connected: boolean;
  models: string[];
  login: null | {
    state: 'pending' | 'completed' | 'failed';
    userCode?: string;
    url?: string;
    message?: string;
  };
}
export const oauthProviderLabels: Record<ProviderId, string> = {
  'openai-codex': 'ChatGPT / Codex',
  'kimi-coding': 'Kimi Coding',
};

export function useOAuthProviders() {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [busy, setBusy] = useState<ProviderId | null>(null);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const mounted = useRef(false);
  const sync = useCallback(async (signal?: AbortSignal) => {
    const response = await serverRequest('/api/ai/oauth/providers', { signal });
    const statuses = (await response.json()) as ProviderStatus[];
    if (!mounted.current || signal?.aborted) return;
    setProviders(statuses);
    setLoadError('');
    for (const provider of statuses) {
      const store = useLearningStore.getState();
      if (
        !provider.connected ||
        store.openAIConfigs.some((config) => config.oauthProvider === provider.id)
      )
        continue;
      const now = Date.now();
      store.addOpenAIConfig({
        id: `oauth-${provider.id}`,
        oauthProvider: provider.id,
        name: oauthProviderLabels[provider.id],
        baseUrl:
          provider.id === 'openai-codex'
            ? 'https://chatgpt.com/backend-api'
            : 'https://api.kimi.com/coding',
        apiKey: '',
        models: provider.models,
        createdAt: now,
        updatedAt: now,
      });
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        await sync(controller.signal);
      } catch (cause) {
        if (!controller.signal.aborted)
          setLoadError(cause instanceof Error ? cause.message : '无法读取授权状态');
      }
      if (!controller.signal.aborted) timer = setTimeout(() => void poll(), 2000);
    };
    void poll();
    return () => {
      mounted.current = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [sync]);

  const action = async (id: ProviderId, operation: 'login' | 'cancel' | 'logout') => {
    setBusy(id);
    setError('');
    try {
      await serverRequest(`/api/ai/oauth/${id}${operation === 'logout' ? '' : '/login'}`, {
        method: operation === 'login' ? 'POST' : 'DELETE',
        headers: { 'X-Learning-Center-OAuth': '1' },
      });
      await sync();
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : '授权操作失败');
    } finally {
      if (mounted.current) setBusy(null);
    }
  };

  return { providers, busy, error: error || loadError, action };
}
