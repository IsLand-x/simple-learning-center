import { Button, Select, Spin, Typography } from '@douyinfe/semi-ui';
import { useSharedBookPreview } from './useSharedBookPreview';

export function SharedBookPreview({ token, onClose }: { token: string; onClose: () => void }) {
  const { hostRef, status, error, chapter, toc, navigate } = useSharedBookPreview(token);
  return (
    <section
      aria-label="书籍只读预览"
      className="book-share-page flex h-dvh min-h-0 flex-col [background:var(--semi-color-bg-0)]"
    >
      <header className="flex min-h-14 shrink-0 items-center justify-between gap-2 border-b [border-color:var(--semi-color-border)] p-3 [background:var(--semi-color-bg-1)]">
        <Button onClick={onClose} theme="borderless" type="tertiary">
          返回分享页
        </Button>
        <Typography.Text ellipsis>{chapter || '书籍预览'}</Typography.Text>
      </header>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div ref={hostRef} className="h-full w-full" />
        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center [background:var(--semi-color-bg-0)]">
            <Spin tip="正在加载书籍" />
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="absolute inset-x-0 top-0 p-4 [background:var(--semi-color-bg-1)] [color:var(--semi-color-text-0)]"
          >
            {error}
          </div>
        )}
      </div>
      <footer className="flex shrink-0 items-center justify-center gap-3 border-t [border-color:var(--semi-color-border)] p-3 [padding-bottom:calc(12px+env(safe-area-inset-bottom))] [background:var(--semi-color-bg-1)]">
        <Button disabled={status !== 'ready'} onClick={() => navigate('prev')}>
          上一页
        </Button>
        <Select
          aria-label="章节目录"
          placeholder="目录"
          className="min-w-0 max-w-64 flex-1"
          disabled={status !== 'ready'}
          optionList={toc.map((item) => ({ value: item.href, label: item.label }))}
          onChange={(href) => {
            if (typeof href === 'string') navigate({ href });
          }}
        />
        <Button disabled={status !== 'ready'} onClick={() => navigate('next')}>
          下一页
        </Button>
      </footer>
    </section>
  );
}
