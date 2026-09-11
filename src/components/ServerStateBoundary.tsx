import { useEffect, useState, type ReactNode } from 'react';
import { Button, Spin, Typography } from '@douyinfe/semi-ui';
import {
  captureServerStateBaseline,
  ensureServerStateContext,
  type ServerStateContext,
} from '../lib/serverStateStorage';
import { useLearningStore } from '../store/useLearningStore';

const { Text } = Typography;

export function ServerStateBoundary({ context, children }: {
  context: ServerStateContext;
  children: ReactNode;
}) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const key = context.scope === 'reader' ? `${context.scope}:${context.bookId ?? ''}` : context.scope;

  useEffect(() => {
    let disposed = false;
    setState('loading');
    setMessage('');
    void ensureServerStateContext(context)
      .then(async (changed) => {
        if (changed) await useLearningStore.persist.rehydrate();
        if (disposed) return;
        captureServerStateBaseline(useLearningStore.getState() as unknown as Record<string, unknown>);
        setState('ready');
      })
      .catch((error) => {
        if (disposed) return;
        setMessage(error instanceof Error ? error.message : '读取页面数据失败');
        setState('error');
      });
    return () => { disposed = true; };
  }, [key, revision]);

  if (state === 'ready') return children;
  return (
    <main className="route-loading">
      {state === 'loading' ? <Spin size="large" /> : (
        <>
          <Text type="danger">{message}</Text>
          <Button theme="solid" type="primary" onClick={() => setRevision((value) => value + 1)}>重新加载</Button>
        </>
      )}
    </main>
  );
}
