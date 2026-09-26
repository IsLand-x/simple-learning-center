import type { BookImageResource } from '../../../../../types/books';
import { useEffect, useRef, useState } from 'react';
import { Button, Input, Typography } from '@douyinfe/semi-ui';

import { useBookResourcesContext } from './useBookResources';

export function BookResourceTitle({ resource }: { resource: BookImageResource }) {
  const { pending, rename } = useBookResourcesContext();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(resource.title);
  const [error, setError] = useState('');
  const container = useRef<HTMLDivElement>(null);
  const wasEditing = useRef(false);

  useEffect(() => {
    if (editing) {
      const input = container.current?.querySelector('input');
      input?.focus();
      input?.select();
    } else if (wasEditing.current) {
      container.current?.querySelector('button')?.focus();
    }
    wasEditing.current = editing;
  }, [editing]);

  const startEditing = () => {
    if (pending) return;
    setDraft(resource.title);
    setError('');
    setEditing(true);
  };

  return (
    <div ref={container} className="book-resource-title">
      {editing ? (
        <form
          className="book-resource-title__editor min-w-0"
          aria-label="重命名资源"
          onSubmit={async (event) => {
            event.preventDefault();
            if (pending) return;
            const title = draft.trim();
            if (!title) {
              setError('标题不能为空');
              return;
            }
            if (title === resource.title) {
              setEditing(false);
              return;
            }
            setError('');
            try {
              await rename(resource.imageId, title);
              setEditing(false);
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : '重命名失败，请重试');
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              if (!pending) setEditing(false);
            }
            if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault();
          }}
        >
          <label htmlFor={`resource-title-${resource.imageId}`}>图片标题</label>
          <Input
            id={`resource-title-${resource.imageId}`}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `resource-title-error-${resource.imageId}` : undefined}
            value={draft}
            maxLength={200}
            disabled={pending}
            validateStatus={error ? 'error' : 'default'}
            onChange={setDraft}
          />
          {error && (
            <Typography.Text
              id={`resource-title-error-${resource.imageId}`}
              type="danger"
              role="alert"
            >
              {error}
            </Typography.Text>
          )}
          <div className="book-resource-title__actions">
            <Button htmlType="submit" theme="solid" loading={pending} disabled={pending}>
              保存
            </Button>
            <Button
              theme="borderless"
              type="tertiary"
              disabled={pending}
              onClick={() => setEditing(false)}
            >
              取消
            </Button>
          </div>
        </form>
      ) : (
        <Button
          className="book-resource-title__trigger [touch-action:manipulation]"
          theme="borderless"
          type="tertiary"
          aria-label={`重命名图片：${resource.title}`}
          title="双击重命名（Enter / F2）"
          disabled={pending}
          onDoubleClick={startEditing}
          onKeyDown={(event) => {
            if (['Enter', 'F2', ' '].includes(event.key)) {
              event.preventDefault();
              startEditing();
            }
          }}
        >
          <Typography.Text strong ellipsis={{ showTooltip: true }}>
            {resource.title}
          </Typography.Text>
        </Button>
      )}
    </div>
  );
}
