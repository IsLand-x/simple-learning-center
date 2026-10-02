import { IconPlus, IconSearch } from '@douyinfe/semi-icons';
import { Button, Typography } from '@douyinfe/semi-ui';
import { type ReactNode } from 'react';
import { useLearningStore } from '../../../../../store/useLearningStore';
import { useWorkspace } from '../../store/WorkspaceContext';
import { SourceActions } from '../SourcesPanel/SourceActions';
import { SourceTree } from '../SourcesPanel/SourceTree';
const { Text } = Typography;

export function MobileSourcesView({
  searchOpen,
  toggleSearch,
  children,
}: {
  searchOpen: boolean;
  toggleSearch: () => void;
  children: ReactNode;
}) {
  const rssItems = useLearningStore((state) => state.rssItems);
  const { sources } = useWorkspace();
  const sourceActions = <SourceActions />;
  const sourcesContent = <SourceTree />;
  const totalUnread = rssItems.filter((item) => !item.readAt).length;
  const onAddSource = () => sources.setAddVisible(true);
  return (
    <section
      className="rss-mobile-screen mobile:h-full mobile:min-w-0 mobile:min-h-0 mobile:overflow-hidden mobile:[background:var(--semi-color-bg-0)] rss-mobile-screen--sources"
      aria-label="订阅源"
    >
      <header className="rss-mobile-topbar mobile:[min-height:58px] mobile:[flex:0_0_58px] mobile:[padding:0_max(8px,_env(safe-area-inset-right))_0_max(8px,_env(safe-area-inset-left))] mobile:[border-bottom:1px_solid_var(--semi-color-border)] mobile:[background:var(--semi-color-bg-1)]">
        <div className="rss-mobile-topbar__identity mobile:min-w-0 mobile:justify-center mobile:[gap:1px] mobile:[line-height:1.25]">
          <Text strong>RSS</Text>
          <Text size="small" type="tertiary">
            {totalUnread} 条未读
          </Text>
        </div>
        <div className="rss-mobile-topbar__actions mobile:min-w-0 mobile:[gap:2px] mobile:[margin-left:auto]">
          <Button
            aria-label={searchOpen ? '收起搜索' : '搜索订阅内容'}
            aria-pressed={searchOpen}
            icon={<IconSearch />}
            theme="borderless"
            type="tertiary"
            onClick={toggleSearch}
          />
          {sourceActions}
          <Button
            aria-label="添加订阅源"
            icon={<IconPlus />}
            theme="borderless"
            type="tertiary"
            onClick={onAddSource}
          />
        </div>
      </header>
      {children}
      <div className="rss-mobile-screen__body mobile:min-w-0 mobile:min-h-0 mobile:overflow-hidden">
        {sourcesContent}
      </div>
    </section>
  );
}
