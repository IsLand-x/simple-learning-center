import { IconBookmark } from '@douyinfe/semi-icons';
import { Button, Toast } from '@douyinfe/semi-ui';
import { ExpandableImage } from '../../../../../components/ExpandableImage';
import { bookResourceImageId } from './model';
import { useBookResourcesContext } from './useBookResources';

export function BookResourceImage({ src, alt = '' }: { src?: string; alt?: string }) {
  const { bookId, resources, pending, loading, mutate } = useBookResourcesContext();
  const imageId = bookResourceImageId(src, bookId);
  const saved = resources.some((resource) => resource.imageId === imageId);
  return (
    <span className="book-resource-image block min-w-0">
      <ExpandableImage src={src} alt={alt} />
      {imageId && (
        <Button
          className="book-resource-image__save"
          aria-label={saved ? '已保存到资源库' : '保存到资源库'}
          icon={<IconBookmark />}
          theme="borderless"
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
