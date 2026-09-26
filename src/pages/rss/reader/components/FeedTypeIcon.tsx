import { IconArticle, IconGlobeStroked, IconVideo } from '@douyinfe/semi-icons';
import type { RssFeedType } from '../../../../types/domain';

export function FeedTypeIcon({ type }: { type: RssFeedType }) {
  if (type === 'video') return <IconVideo />;
  if (type === 'social') return <IconGlobeStroked />;
  return <IconArticle />;
}
