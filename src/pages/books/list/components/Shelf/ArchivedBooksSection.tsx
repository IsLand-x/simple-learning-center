import { useId, useState, type ReactNode } from 'react';
import { IconChevronDown, IconChevronRight } from '@douyinfe/semi-icons';
import { Button, Empty, Typography } from '@douyinfe/semi-ui';

export function ArchivedBooksSection({
  count,
  matchingCount,
  filtered,
  children,
}: {
  count: number;
  matchingCount: number;
  filtered: boolean;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(filtered);
  const contentId = useId();
  const titleId = useId();
  return (
    <section
      className="library-book-section library-archive border-t border-[var(--semi-color-border)] pt-4"
      aria-labelledby={titleId}
    >
      <div className="mb-3 flex min-h-11 items-center">
        <Button
          block
          contentClassName="w-full"
          className="relative touch-manipulation after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-[''] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-[var(--semi-color-focus-border)]"
          theme="borderless"
          type="tertiary"
          aria-expanded={expanded}
          aria-controls={contentId}
          aria-label={expanded ? '收起存档书籍' : '展开存档书籍'}
          onClick={() => setExpanded((value) => !value)}
        >
          <span className="flex w-full min-w-0 items-center justify-between gap-2">
            <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <Typography.Text id={titleId} type="secondary">
                已存档 · {count} 本书
              </Typography.Text>
              {filtered && (
                <Typography.Text size="small" type="tertiary">
                  符合筛选 {matchingCount} 本
                </Typography.Text>
              )}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {expanded ? <IconChevronDown /> : <IconChevronRight />}
              {expanded ? '收起' : '展开'}
            </span>
          </span>
        </Button>
      </div>
      {expanded && (
        <div id={contentId}>
          {matchingCount ? (
            <div className="book-grid">{children}</div>
          ) : (
            <div className="py-6">
              <Empty title="没有符合筛选的存档书籍" />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
