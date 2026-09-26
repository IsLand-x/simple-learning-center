import {
  IconCheckList,
  IconChevronLeft,
  IconRefresh,
  IconSearch,
  IconSetting,
} from '@douyinfe/semi-icons';
import { Button, Typography } from '@douyinfe/semi-ui';
import { type ReactNode } from 'react';
import { useLearningStore } from '../../../../../store/useLearningStore';
import { useWorkspace } from '../../store/WorkspaceContext';
import { ItemList } from '../ItemsPanel/ItemList';
const { Text } = Typography;

export function MobileItemsView({
  searchOpen,
  toggleSearch,
  children,
}: {
  searchOpen: boolean;
  toggleSearch: () => void;
  children: ReactNode;
}) {
  const { tasks, navigation: workspace } = useWorkspace();

  const markRssItemsRead = useLearningStore((state) => state.markRssItemsRead);
  const itemCount =
    workspace.selectedFeedId === 'daily'
      ? workspace.digestList.length
      : workspace.filteredItems.length;
  const itemCountUnit = workspace.selectedFeedId === 'daily' ? '天' : '条内容';
  const itemsContent = <ItemList />;
  const itemsActions =
    workspace.selectedFeedId === 'daily' ? (
      <>
        <Button
          aria-label="立即更新今天的日报"
          icon={<IconRefresh />}
          loading={tasks.digestGenerating}
          theme="borderless"
          type="tertiary"
          onClick={() => void tasks.runDigest(workspace.todayKey)}
        />
        <Button
          aria-label="打开日报设置"
          icon={<IconSetting />}
          theme="borderless"
          type="tertiary"
          onClick={() => workspace.setDigestSettingsVisible(true)}
        />
      </>
    ) : undefined;
  const sourceTitle = workspace.selectedSourceTitle;
  const unreadVisibleCount = workspace.unreadVisibleItems.length;
  const onBackToSources = workspace.showMobileSources;
  const onMarkVisibleRead = () =>
    markRssItemsRead(workspace.unreadVisibleItems.map((item) => item.id));
  return (
    <section
      className="rss-mobile-screen mobile:h-full mobile:min-w-0 mobile:min-h-0 mobile:overflow-hidden mobile:[background:var(--semi-color-bg-0)] rss-mobile-screen--items"
      aria-label="订阅内容列表"
    >
      <header className="rss-mobile-topbar mobile:[min-height:58px] mobile:[flex:0_0_58px] mobile:[padding:0_max(8px,_env(safe-area-inset-right))_0_max(8px,_env(safe-area-inset-left))] mobile:[border-bottom:1px_solid_var(--semi-color-border)] mobile:[background:var(--semi-color-bg-1)]">
        <Button
          className="rss-mobile-topbar__back"
          aria-label="返回订阅源"
          icon={<IconChevronLeft />}
          theme="borderless"
          type="tertiary"
          onClick={onBackToSources}
        />
        <div className="rss-mobile-topbar__identity mobile:min-w-0 mobile:justify-center mobile:[gap:1px] mobile:[line-height:1.25] rss-mobile-topbar__identity--grow">
          <Text strong ellipsis={{ showTooltip: true }}>
            {sourceTitle}
          </Text>
          <Text size="small" type="tertiary">
            {itemCount} {itemCountUnit}
          </Text>
        </div>
        <div className="rss-mobile-topbar__actions mobile:min-w-0 mobile:[gap:2px] mobile:[margin-left:auto]">
          {itemsActions ?? (
            <>
              <Button
                aria-label={searchOpen ? '收起搜索' : '搜索当前订阅内容'}
                aria-pressed={searchOpen}
                icon={<IconSearch />}
                theme="borderless"
                type="tertiary"
                onClick={toggleSearch}
              />
              <Button
                aria-label="当前列表一键已读"
                disabled={!unreadVisibleCount}
                icon={<IconCheckList />}
                theme="borderless"
                type="tertiary"
                onClick={onMarkVisibleRead}
              />
            </>
          )}
        </div>
      </header>
      {children}
      <div className="rss-mobile-screen__body mobile:min-w-0 mobile:min-h-0 mobile:overflow-hidden">
        {itemsContent}
      </div>
    </section>
  );
}
