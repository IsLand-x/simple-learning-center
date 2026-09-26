import { useCallback, useEffect, useRef } from 'react';
import { Toast } from '@douyinfe/semi-ui';
import { confirmDialog } from '../../../../../util/confirmDialog';

const historyKey = 'learningCenterResourceRemoval';

export function useResourceRemoval(remove: (imageId: string) => Promise<void>) {
  const active = useRef<{ id: string; dialog: ReturnType<typeof confirmDialog> } | null>(null);
  const close = useCallback((id: string, restoreHistory = true) => {
    if (active.current?.id !== id) return;
    const { dialog } = active.current;
    active.current = null;
    dialog.destroy();
    if (restoreHistory && window.history.state?.[historyKey] === id) window.history.back();
  }, []);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      if (active.current && event.state?.[historyKey] !== active.current.id)
        close(active.current.id, false);
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      if (active.current) close(active.current.id);
    };
  }, [close]);

  return (imageId: string) => {
    if (active.current) return;
    const id = crypto.randomUUID();
    const dialog = confirmDialog({
      title: '从资源库移除图片？',
      content: '只移除本书资源库中的收藏，对话中的原图仍会保留。',
      okText: '移除',
      cancelText: '取消',
      okButtonProps: { type: 'danger', 'aria-label': '移除' },
      cancelButtonProps: { 'aria-label': '取消' },
      onCancel: () => close(id),
      onOk: async () => {
        try {
          await remove(imageId);
          close(id);
        } catch (cause) {
          Toast.error(cause instanceof Error ? cause.message : '移除失败，请重试');
          throw cause;
        }
      },
    });
    active.current = { id, dialog };
    window.history.pushState(
      { ...window.history.state, [historyKey]: id },
      '',
      window.location.href,
    );
  };
}
