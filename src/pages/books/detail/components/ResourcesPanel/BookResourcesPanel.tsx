import { useId, useState } from 'react';
import { sortBookResources, type ResourceSortOrder } from './model';
import { IconDelete } from '@douyinfe/semi-icons';
import { Button, Empty, Select, Spin, Typography } from '@douyinfe/semi-ui';
import { ExpandableImage } from '../../../../../components/ExpandableImage';
import { BookResourceTitle } from './BookResourceTitle';
import { useBookResourcesContext } from './useBookResources';
import { useResourceRemoval } from './useResourceRemoval';

export function BookResourcesPanel() {
  const { resources, loading, error, pending, reload, mutate } = useBookResourcesContext();
  const sortLabelId = useId();
  const [sortOrder, setSortOrder] = useState<ResourceSortOrder>('newest');
  const sortedResources = sortBookResources(resources, sortOrder);
  const confirmRemoval = useResourceRemoval(mutate);
  return (
    <div className="right-panel__body min-h-0 book-resources min-w-0 min-h-0 [color:var(--semi-color-text-0)]">
      {loading ? (
        <div className="book-resources__status justify-center [padding:24px_12px]">
          <Spin />
          <Typography.Text type="tertiary">正在加载资源库</Typography.Text>
        </div>
      ) : error ? (
        <Empty title="资源库加载失败" description={error}>
          <Button disabled={pending} onClick={() => void reload()}>
            重试
          </Button>
        </Empty>
      ) : !resources.length ? (
        <Empty title="还没有保存的图片" description="在 AI 对话的图片下点击“保存到资源库”" />
      ) : (
        <>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <Typography.Text type="tertiary">已保存 {resources.length} 张图片</Typography.Text>
            <div className="flex min-w-0 items-center gap-2 py-1.5">
              <span id={sortLabelId} className="text-xs [color:var(--semi-color-text-2)]">
                排序
              </span>
              <Select
                aria-labelledby={sortLabelId}
                className="relative mobile:after:absolute mobile:after:inset-x-0 mobile:after:-inset-y-1.5"
                value={sortOrder}
                optionList={[
                  { value: 'newest', label: '创建时间倒序' },
                  { value: 'oldest', label: '创建时间正序' },
                ]}
                onChange={(value) => {
                  if (value === 'newest' || value === 'oldest') setSortOrder(value);
                }}
              />
            </div>
          </div>
          <div className="book-resources__list [margin-top:12px]">
            {sortedResources.map((resource) => (
              <article
                className="book-resources__item min-w-0 [padding:8px] [background:var(--semi-color-bg-0)]"
                key={resource.imageId}
              >
                <ExpandableImage src={resource.url} alt={resource.title} />
                <div className="book-resources__details [padding-top:8px]">
                  <div className="book-resources__caption min-w-0 [gap:4px]">
                    <BookResourceTitle resource={resource} />
                    <Typography.Text type="tertiary" size="small">
                      {new Date(resource.savedAt).toLocaleDateString('zh-CN')}
                    </Typography.Text>
                  </div>
                  <Button
                    icon={<IconDelete />}
                    theme="borderless"
                    type="danger"
                    aria-label={`移除图片：${resource.title}`}
                    disabled={pending}
                    onClick={() => confirmRemoval(resource.imageId)}
                  />
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
