import { IconAIStrokedLevel1, IconCalendarClock, IconComment } from '@douyinfe/semi-icons';
import { Empty, Typography } from '@douyinfe/semi-ui';
import type { RssAnnotation, RssFeed, RssItem } from '../../../../../../contracts/rss';
import { ContentConversationPanel } from '../../../../../components/ai/ContentConversationPanel';
import { type RssSidePanel } from '../../store/navigation';
import { RssCommentsPanel } from './RssCommentsPanel';
import { TimelinePanel } from './TimelinePanel';

const { Text } = Typography;

export function RssRightPanel({
  activePanel,
  annotations = [],
  item,
  items,
  feeds,
  query,
  selectedText,
  onClearSelectedText,
  onJumpAnnotation = () => undefined,
}: {
  activePanel: Exclude<RssSidePanel, null>;
  annotations?: RssAnnotation[];
  item?: RssItem;
  items: RssItem[];
  feeds: RssFeed[];
  query: string;
  selectedText?: string;
  onClearSelectedText?: () => void;
  onJumpAnnotation?: (annotation: RssAnnotation) => void;
}) {
  const PanelIcon =
    activePanel === 'ai'
      ? IconAIStrokedLevel1
      : activePanel === 'comments'
        ? IconComment
        : IconCalendarClock;
  const title = activePanel === 'ai' ? 'AI 助手' : activePanel === 'comments' ? '评论' : '时间线';
  return (
    <aside
      className={`right-panel w-full min-h-0 overflow-hidden [background:var(--semi-color-bg-1)] min-w-0 [max-width:none] ${activePanel === 'ai' ? ' right-panel--ai' : ''}`}
      aria-label={title}
    >
      <div className="panel-titlebar [height:var(--reader-bar-height)] [min-height:var(--reader-bar-height)] justify-between [padding:0_8px_0_12px]">
        <div className="panel-titlebar__title min-w-0 [color:var(--semi-color-text-1)]">
          <PanelIcon size="large" className="panel-tool-icon" />
          <Text strong>{title}</Text>
        </div>
      </div>
      {activePanel === 'ai' ? (
        item ? (
          <ContentConversationPanel
            resource={{ type: 'rss', item }}
            selectedText={selectedText}
            onClearSelectedText={onClearSelectedText}
          />
        ) : (
          <div className="right-panel__body min-h-0">
            <Empty title="选择一条订阅内容" description="选择内容后即可与 AI 对话" />
          </div>
        )
      ) : activePanel === 'comments' ? (
        item ? (
          <RssCommentsPanel annotations={annotations} onJumpAnnotation={onJumpAnnotation} />
        ) : (
          <div className="right-panel__body min-h-0">
            <Empty title="选择一条订阅内容" description="文章评论会显示在这里" />
          </div>
        )
      ) : (
        <TimelinePanel items={items} feeds={feeds} query={query} />
      )}
    </aside>
  );
}
