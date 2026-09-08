import { useEffect, useState, type ReactNode } from 'react';
import { Button, Spin } from '@douyinfe/semi-ui';
import {
  activateServerStateDomains,
  areServerStateDomainsActive,
  ensureServerStateDomains,
} from '../lib/serverStateStorage';
import type { StateDomain } from '../lib/stateDomains';
import { useLearningStore } from '../store/useLearningStore';

interface StateDomainGateProps {
  children: ReactNode;
  domains: readonly StateDomain[];
}

export function StateDomainGate({ children, domains }: StateDomainGateProps) {
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(() => areServerStateDomainsActive(domains));
  const [error, setError] = useState('');
  const domainKey = domains.join(',');

  useEffect(() => {
    if (areServerStateDomainsActive(domains)) {
      setReady(true);
      setError('');
      return;
    }
    let disposed = false;
    setReady(false);
    setError('');
    void ensureServerStateDomains(domains)
      .then(() => useLearningStore.persist.rehydrate())
      .then(() => {
        activateServerStateDomains(domains);
        if (!disposed) setReady(true);
      })
      .catch((reason) => {
        if (!disposed) setError(reason instanceof Error ? reason.message : '读取页面数据失败');
      });
    return () => {
      disposed = true;
    };
  }, [attempt, domainKey, domains]);

  if (error) {
    return (
      <main className="route-loading">
        <p>{error}</p>
        <Button onClick={() => setAttempt((current) => current + 1)}>重新连接</Button>
      </main>
    );
  }
  if (!ready) return <div className="route-loading"><Spin size="large" /></div>;
  return children;
}
