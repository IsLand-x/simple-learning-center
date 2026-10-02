import { IconSearch } from '@douyinfe/semi-icons';
import { Input, Typography } from '@douyinfe/semi-ui';
import { Allotment } from 'allotment';
import { useLearningStore } from '../../../../store/useLearningStore';
import { useWorkspace } from '../store/WorkspaceContext';
import { ArticlePanel } from './ArticlePanel/ArticlePanel';
import { ItemsPanel } from './ItemsPanel/ItemsPanel';
import { SourcesPanel } from './SourcesPanel/SourcesPanel';

const { Text, Title } = Typography;
export function DesktopWorkspace() {
  const rssItems = useLearningStore((state) => state.rssItems);
  const { navigation: workspace } = useWorkspace();

  return (
    <>
      <header className="rss-page__header [min-height:52px] [padding:0_14px_0_16px] [background:var(--semi-color-bg-1)]">
        <div className="rss-page__heading [min-width:170px] [align-items:baseline]">
          <Title heading={5}>RSS</Title>
          <Text size="small" type="tertiary">
            {rssItems.filter((item) => !item.readAt).length} 条未读
          </Text>
        </div>
        <Input
          aria-label="搜索订阅内容"
          prefix={<IconSearch />}
          placeholder="搜索订阅内容"
          showClear
          value={workspace.query}
          onChange={(value) => {
            workspace.setQuery(value);
            workspace.setSelectedItemId(null);
          }}
          className="rss-search-input [width:min(320px,_32vw)] [margin-left:auto] [@media(max-width:560px)]:[width:140px]"
        />
      </header>

      <div className="rss-page__workspace min-w-0 min-h-0 overflow-hidden">
        <Allotment className="rss-allotment w-full" separator vertical={workspace.compactLayout}>
          <Allotment.Pane
            minSize={workspace.compactLayout ? 120 : 160}
            preferredSize={workspace.compactLayout ? 180 : 220}
            maxSize={workspace.compactLayout ? 240 : 340}
          >
            <SourcesPanel />
          </Allotment.Pane>

          <Allotment.Pane
            minSize={workspace.compactLayout ? 160 : 190}
            preferredSize={workspace.compactLayout ? 220 : 320}
            maxSize={workspace.compactLayout ? 320 : 520}
          >
            <ItemsPanel />
          </Allotment.Pane>

          <Allotment.Pane minSize={workspace.compactLayout ? 240 : 300}>
            <ArticlePanel />
          </Allotment.Pane>
        </Allotment>
      </div>
    </>
  );
}
