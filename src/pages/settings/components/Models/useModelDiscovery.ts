import { useEffect, useRef, useState } from 'react';
import { aiApi } from '../../../../api/ai';
import type { DiscoverModelsResponse } from '../../../../api/ai/type';

export function useModelDiscovery(baseUrl: string, apiKey: string, active: boolean) {
  const controller = useRef<AbortController | null>(null);
  const [result, setResult] = useState<DiscoverModelsResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setResult(null);
    setError('');
    setBusy(false);
    return () => {
      controller.current?.abort();
      controller.current = null;
    };
  }, [baseUrl, apiKey, active]);

  async function discover() {
    if (controller.current || !active) return null;
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setError('');
    try {
      const response = await aiApi.discoverModels(
        { baseUrl: baseUrl.trim(), apiKey: apiKey.trim() },
        request.signal,
      );
      if (request.signal.aborted) return null;
      setResult(response);
      return response;
    } catch (cause) {
      if (!request.signal.aborted) {
        setError(cause instanceof Error ? cause.message : '检测模型失败，请稍后重试');
      }
      return null;
    } finally {
      if (controller.current === request) {
        controller.current = null;
        setBusy(false);
      }
    }
  }

  return { result, busy, error, discover };
}
