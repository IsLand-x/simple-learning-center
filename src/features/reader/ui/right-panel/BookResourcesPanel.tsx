import { Button, Empty, Spin, Toast, Typography } from '@douyinfe/semi-ui';
import { IconDelete, IconBookmark } from '@douyinfe/semi-icons';
import type { ReactNode } from 'react';
import { ExpandableImage } from '../../../../shared/ui/ExpandableImage';
import { useResourceRemoval } from '../../hooks/useResourceRemoval';
import {
  BookResourcesContext,
  useBookResources,
  useBookResourcesContext,
} from '../../hooks/useBookResources';
import { bookResourceImageId } from '../../model/bookResources';

export function BookResourcesProvider({
  bookId,
  children,
}: {
  bookId: string;
  children: ReactNode;
}) {
  const value = useBookResources(bookId);
  return <BookResourcesContext.Provider value={value}>{children}</BookResourcesContext.Provider>;
}

export function BookResourceImage({ src, alt = '' }: { src?: string; alt?: string }) {
  const { bookId, resources, pending, loading, mutate } = useBookResourcesContext();
  const imageId = bookResourceImageId(src, bookId);
  const saved = resources.some((resource) => resource.imageId === imageId);
  return (
    <span className="book-resource-image">
      <ExpandableImage src={src} alt={alt} />
      {imageId && (
        <Button
          className="book-resource-image__save"
          aria-label={saved ? '已保存到资源库' : '保存到资源库'}
          icon={<IconBookmark />}
          theme="borderless"
          size="small"
          loading={pending && !saved}
          disabled={saved || pending || loading}
          onClick={async () => {
            try {
              await mutate(imageId, alt.trim().slice(0, 200) || '信息图');
              Toast.success('已保存到本书资源库');
            } catch (cause) {
              Toast.error(cause instanceof Error ? cause.message : '保存失败，请重试');
            }
          }}
        >
          {saved ? '已保存到资源库' : '保存到资源库'}
        </Button>
      )}
    </span>
  );
}

export function BookResourcesPanel() {
  const { resources, loading, error, pending, reload, mutate } = useBookResourcesContext();
  const confirmRemoval = useResourceRemoval(mutate);
  return (
    <div className="right-panel__body book-resources">
      {loading ? (
        <div className="book-resources__status">
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
          <Typography.Text type="tertiary">已保存 {resources.length} 张图片</Typography.Text>
          <div className="book-resources__list">
            {resources.map((resource) => (
              <article className="book-resources__item" key={resource.imageId}>
                <ExpandableImage src={resource.url} alt={resource.title} />
                <div className="book-resources__details">
                  <div className="book-resources__caption">
                    <Typography.Text strong ellipsis={{ showTooltip: true }}>
                      {resource.title}
                    </Typography.Text>
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
