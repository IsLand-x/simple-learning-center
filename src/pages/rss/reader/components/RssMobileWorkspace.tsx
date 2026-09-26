import { useEffect, useState, type ReactNode } from 'react';
import { Button, Input, SideSheet, Typography } from '@douyinfe/semi-ui';
import {
  IconAIStrokedLevel1,
  IconBookmark,
  IconCalendarClock,
  IconCheckList,
  IconChevronLeft,
  IconChevronRight,
  IconColorPalette,
  IconExternalOpen,
  IconGlobeStroked,
  IconMore,
  IconPlus,
  IconSearch,
} from '@douyinfe/semi-icons';

const { Text } = Typography;

import type { RssMobileView, RssMobilePanel } from '../store/model/mobileWorkspace';

interface RssMobileWorkspaceProps {
  activePanel: RssMobilePanel;
  articleFetching: boolean;
  bookmarked: boolean;
  canFetchArticle: boolean;
  detailContent: ReactNode;
  detailActions?: ReactNode;
  detailIsDigest?: boolean;
  detailStatus: string;
  detailTitle?: string;
  hasOriginalLink: boolean;
  hasNextItem: boolean;
  hasPreviousItem: boolean;
  itemCount: number;
  itemCountUnit?: string;
  itemsContent: ReactNode;
  itemsActions?: ReactNode;
  panelContent: ReactNode;
  query: string;
  sourceActions: ReactNode;
  sourceTitle: string;
  sourcesContent: ReactNode;
  totalUnread: number;
  unreadVisibleCount: number;
  view: RssMobileView;
  onAddSource: () => void;
  onBackToItems: () => void;
  onBackToSources: () => void;
  onChangePanel: (panel: RssMobilePanel) => void;
  onChangeQuery: (query: string) => void;
  onFetchArticle: () => void;
  onMarkVisibleRead: () => void;
  onOpenNextItem: () => void;
  onOpenOriginal: () => void;
  onOpenPreviousItem: () => void;
  onToggleBookmark: () => void;
}

const panelLabels: Record<Exclude<RssMobilePanel, null>, string> = {
  style: '样式',
  ai: 'AI',
  timeline: '时间线',
};

export function RssMobileWorkspace({
  activePanel,
  articleFetching,
  bookmarked,
  canFetchArticle,
  detailContent,
  detailActions,
  detailIsDigest = false,
  detailStatus,
  detailTitle,
  hasOriginalLink,
  hasNextItem,
  hasPreviousItem,
  itemCount,
  itemCountUnit = '条内容',
  itemsContent,
  itemsActions,
  panelContent,
  query,
  sourceActions,
  sourceTitle,
  sourcesContent,
  totalUnread,
  unreadVisibleCount,
  view,
  onAddSource,
  onBackToItems,
  onBackToSources,
  onChangePanel,
  onChangeQuery,
  onFetchArticle,
  onMarkVisibleRead,
  onOpenNextItem,
  onOpenOriginal,
  onOpenPreviousItem,
  onToggleBookmark,
}: RssMobileWorkspaceProps) {
  const [searchOpen, setSearchOpen] = useState(Boolean(query));

  useEffect(() => {
    if (query) setSearchOpen(true);
    if (view === 'detail') setSearchOpen(false);
  }, [query, view]);

  const searchVisible = view !== 'detail' && searchOpen;
  const toggleSearch = () => setSearchOpen((current) => !current);
  const renderSearch = () =>
    searchVisible ? (
      <div className="rss-mobile-search mobile:[flex:0_0_auto] mobile:[padding:8px_12px] mobile:[border-bottom:1px_solid_var(--semi-color-border)] mobile:[background:var(--semi-color-bg-1)]">
        <Input
          aria-label="搜索订阅内容"
          autoFocus
          className="rss-mobile-search__input"
          placeholder="搜索订阅内容"
          prefix={<IconSearch />}
          showClear
          value={query}
          onChange={onChangeQuery}
        />
      </div>
    ) : null;

  return (
    <div
      className={`rss-mobile-workspace mobile:h-full mobile:min-w-0 mobile:min-h-0 mobile:overflow-hidden mobile:[background:var(--semi-color-bg-0)] rss-mobile-workspace--${view}`}
    >
      {view === 'sources' && (
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
          {renderSearch()}
          <div className="rss-mobile-screen__body mobile:min-w-0 mobile:min-h-0 mobile:overflow-hidden">
            {sourcesContent}
          </div>
        </section>
      )}

      {view === 'items' && (
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
          {renderSearch()}
          <div className="rss-mobile-screen__body mobile:min-w-0 mobile:min-h-0 mobile:overflow-hidden">
            {itemsContent}
          </div>
        </section>
      )}

      {view === 'detail' && (
        <section
          className="rss-mobile-screen mobile:h-full mobile:min-w-0 mobile:min-h-0 mobile:overflow-hidden mobile:[background:var(--semi-color-bg-0)] rss-mobile-screen--detail"
          aria-label="订阅内容详情"
        >
          <header className="rss-mobile-topbar mobile:[min-height:58px] mobile:[flex:0_0_58px] mobile:[padding:0_max(8px,_env(safe-area-inset-right))_0_max(8px,_env(safe-area-inset-left))] mobile:[border-bottom:1px_solid_var(--semi-color-border)] mobile:[background:var(--semi-color-bg-1)] rss-mobile-topbar--detail">
            <Button
              className="rss-mobile-topbar__back"
              aria-label={activePanel ? '关闭更多阅读工具' : '返回订阅内容列表'}
              icon={<IconChevronLeft />}
              theme="borderless"
              type="tertiary"
              onClick={() => (activePanel ? onChangePanel(null) : onBackToItems())}
            />
            <div className="rss-mobile-topbar__identity mobile:min-w-0 mobile:justify-center mobile:[gap:1px] mobile:[line-height:1.25] rss-mobile-topbar__identity--grow">
              <Text strong ellipsis={{ showTooltip: true }}>
                {detailTitle ?? '订阅内容详情'}
              </Text>
              <Text size="small" type="tertiary">
                {detailStatus}
              </Text>
            </div>
            <div className="rss-mobile-topbar__actions mobile:min-w-0 mobile:[gap:2px] mobile:[margin-left:auto]">
              {detailActions ?? (
                <>
                  <Button
                    aria-label={bookmarked ? '取消收藏' : '收藏'}
                    aria-pressed={bookmarked}
                    className={bookmarked ? 'rss-bookmark-button--active' : ''}
                    icon={
                      <IconBookmark
                        className={
                          bookmarked ? 'rss-bookmark-icon--filled' : 'rss-bookmark-icon--empty'
                        }
                      />
                    }
                    theme="borderless"
                    type="tertiary"
                    onClick={onToggleBookmark}
                  />
                  <Button
                    aria-label="读取原文"
                    disabled={!canFetchArticle}
                    icon={<IconGlobeStroked />}
                    loading={articleFetching}
                    theme="borderless"
                    type="tertiary"
                    onClick={onFetchArticle}
                  />
                  {hasOriginalLink && (
                    <Button
                      aria-label="打开原文"
                      icon={<IconExternalOpen />}
                      theme="borderless"
                      type="tertiary"
                      onClick={onOpenOriginal}
                    />
                  )}
                </>
              )}
            </div>
          </header>
          <div className="rss-mobile-screen__body mobile:min-w-0 mobile:min-h-0 mobile:overflow-hidden">
            {detailContent}
          </div>
          {!detailIsDigest && (
            <nav
              className="rss-mobile-reader-tools mobile:[height:calc(var(--mobile-reader-toolbar-height,_58px)_+_env(safe-area-inset-bottom))] mobile:[min-height:calc(var(--mobile-reader-toolbar-height,_58px)_+_env(safe-area-inset-bottom))] mobile:[grid-template-columns:repeat(3,_minmax(0,_1fr))] mobile:[flex:0_0_auto] mobile:[padding:4px_max(8px,_env(safe-area-inset-right))_max(4px,_env(safe-area-inset-bottom))_max(8px,_env(safe-area-inset-left))] mobile:[border-top:1px_solid_var(--semi-color-border)] mobile:[background:var(--semi-color-bg-1)]"
              aria-label="RSS 阅读工具"
            >
              <Button
                aria-label="上一篇订阅内容"
                disabled={!hasPreviousItem}
                icon={<IconChevronLeft />}
                theme="borderless"
                type="tertiary"
                onClick={onOpenPreviousItem}
              >
                上一篇
              </Button>
              <Button
                aria-label="下一篇订阅内容"
                disabled={!hasNextItem}
                icon={<IconChevronRight />}
                theme="borderless"
                type="tertiary"
                onClick={onOpenNextItem}
              >
                下一篇
              </Button>
              <Button
                aria-label={activePanel ? '收起更多阅读工具' : '打开更多阅读工具'}
                aria-pressed={Boolean(activePanel)}
                className={activePanel ? 'rss-mobile-reader-tools__button--active' : ''}
                icon={<IconMore />}
                theme="borderless"
                type="tertiary"
                onClick={() => onChangePanel(activePanel ? null : 'ai')}
              >
                更多
              </Button>
            </nav>
          )}
        </section>
      )}

      <SideSheet
        aria-label={activePanel ? `RSS 辅助工具：${panelLabels[activePanel]}` : 'RSS 辅助工具'}
        bodyStyle={{ padding: 0, overflow: 'hidden' }}
        className="mobile-reader-sheet mobile:pointer-events-none mobile-assistant-sheet rss-mobile-sheet"
        closable={false}
        height="90dvh"
        mask
        maskClosable
        placement="bottom"
        visible={Boolean(activePanel)}
        zIndex={38}
        onCancel={() => onChangePanel(null)}
      >
        <div
          className="mobile-sheet-grabber mobile:[width:36px] mobile:[height:4px] mobile:[flex:0_0_auto] mobile:[margin:8px_auto_4px] mobile:[border-radius:999px] mobile:[background:var(--semi-color-fill-2)]"
          aria-hidden="true"
        />
        <div className="rss-mobile-sheet__content mobile:min-w-0 mobile:min-h-0 mobile:overflow-hidden">
          {panelContent}
        </div>
        <nav
          className="mobile-panel-tabs mobile:[height:calc(53px_+_env(safe-area-inset-bottom))] mobile:[min-height:calc(53px_+_env(safe-area-inset-bottom))] mobile:[flex:0_0_auto] mobile:[gap:2px] mobile:[padding:4px_8px_calc(4px_+_env(safe-area-inset-bottom))] mobile:overflow-x-auto mobile:[overflow-y:hidden] mobile:[overscroll-behavior-x:contain] mobile:[overscroll-behavior-y:none] mobile:[border-top:1px_solid_var(--semi-color-border)] mobile:[background:var(--semi-color-bg-1)] mobile:[scrollbar-width:none] mobile:[touch-action:pan-x] rss-mobile-panel-tabs mobile:[grid-template-columns:repeat(3,_minmax(0,_1fr))]"
          aria-label="RSS 辅助工具切换"
        >
          <Button
            aria-pressed={activePanel === 'ai'}
            className={activePanel === 'ai' ? 'rss-mobile-panel-tabs__button--active' : ''}
            icon={<IconAIStrokedLevel1 />}
            theme="borderless"
            type="tertiary"
            onClick={() => onChangePanel('ai')}
          >
            AI
          </Button>
          <Button
            aria-pressed={activePanel === 'style'}
            className={activePanel === 'style' ? 'rss-mobile-panel-tabs__button--active' : ''}
            icon={<IconColorPalette />}
            theme="borderless"
            type="tertiary"
            onClick={() => onChangePanel('style')}
          >
            样式
          </Button>
          <Button
            aria-pressed={activePanel === 'timeline'}
            className={activePanel === 'timeline' ? 'rss-mobile-panel-tabs__button--active' : ''}
            icon={<IconCalendarClock />}
            theme="borderless"
            type="tertiary"
            onClick={() => onChangePanel('timeline')}
          >
            时间线
          </Button>
        </nav>
      </SideSheet>
    </div>
  );
}
