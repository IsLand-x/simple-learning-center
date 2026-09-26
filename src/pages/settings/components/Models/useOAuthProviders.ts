import { useCallback, useEffect, useRef, useState } from 'react';
import { settingsApi } from '../../../../api/settings';
import { useLearningStore } from '../../../../store/useLearningStore';
import type {
  OAuthProviderId,
  OAuthProviderStatus,
  OAuthOperation,
} from '../../../../api/settings/type';

export const oauthProviderLabels: Record<OAuthProviderId, string> = {
  'openai-codex': 'ChatGPT / Codex',
  'kimi-coding': 'Kimi Coding',
};

export function useOAuthProviders() {
  const [providers, setProviders] = useState<OAuthProviderStatus[]>([]);
  const [busy, setBusy] = useState<OAuthProviderId | null>(null);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const mounted = useRef(false);
  const sync = useCallback(async (signal?: AbortSignal) => {
    const statuses = await settingsApi.getOAuthProviders(signal);
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

  const action = async (id: OAuthProviderId, operation: OAuthOperation) => {
    setBusy(id);
    setError('');
    try {
      await settingsApi.operateOAuthProvider(id, operation);
      await sync();
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : '授权操作失败');
    } finally {
      if (mounted.current) setBusy(null);
    }
  };

  return { providers, busy, error: error || loadError, action };
}
