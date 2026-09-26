import { Button, Empty } from '@douyinfe/semi-ui';

export function MissingReaderBook({ onBack }: { onBack: () => void }) {
  return (
    <main className="missing-book [min-height:360px] [place-items:center] [align-content:center] [gap:16px] w-full [background:var(--semi-color-bg-0)]">
      <Empty title="这本书不在书架中" description="它可能已被删除，或服务器数据目录已被清理" />
      <Button theme="solid" type="primary" onClick={onBack}>
        返回书架
      </Button>
    </main>
  );
}
