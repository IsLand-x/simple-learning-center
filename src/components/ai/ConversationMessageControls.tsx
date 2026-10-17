import { Button, Spin, Typography } from '@douyinfe/semi-ui';

export function ConversationMessageControls({
  loading,
  error,
  hasMore = false,
  loadMore,
  retry,
}: {
  loading: boolean;
  error: string;
  hasMore?: boolean;
  loadMore?: () => void;
  retry: () => void;
}) {
  if (!loading && !error && !hasMore) return null;
  return (
    <div
      className="flex shrink-0 items-center justify-center gap-2 py-2 [color:var(--semi-color-text-1)]"
      role="status"
    >
      {loading ? (
        <Spin size="small" />
      ) : error ? (
        <>
          <Typography.Text type="danger" size="small">
            {error}
          </Typography.Text>
          <Button size="small" theme="borderless" onClick={retry}>
            重试
          </Button>
        </>
      ) : (
        <Button size="small" theme="borderless" onClick={loadMore}>
          加载更早消息
        </Button>
      )}
    </div>
  );
}
