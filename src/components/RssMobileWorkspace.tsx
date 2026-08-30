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

export type RssMobileView = 'sources' | 'items' | 'detail';
export type RssMobilePanel = 'style' | 'ai' | 'timeline' | null;

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
  const renderSearch = () => searchVisible ? (
    <div className="rss-mobile-search">
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
    <div className={`rss-mobile-workspace rss-mobile-workspace--${view}`}>
      {view === 'sources' && (
        <section className="rss-mobile-screen rss-mobile-screen--sources" aria-label="订阅源">
          <header className="rss-mobile-topbar">
            <div className="rss-mobile-topbar__identity">
              <Text strong>RSS</Text>
              <Text size="small" type="tertiary">{totalUnread} 条未读</Text>
            </div>
            <div className="rss-mobile-topbar__actions">
              <Button
                aria-label={searchOpen ? '收起搜索' : '搜索订阅内容'}
                aria-pressed={searchOpen}
                icon={<IconSearch />}
                theme="borderless"
                type="tertiary"
                onClick={toggleSearch}
              />
              {sourceActions}
              <Button aria-label="添加订阅源" icon={<IconPlus />} theme="borderless" type="tertiary" onClick={onAddSource} />
            </div>
          </header>
          {renderSearch()}
          <div className="rss-mobile-screen__body">{sourcesContent}</div>
        </section>
      )}

      {view === 'items' && (
        <section className="rss-mobile-screen rss-mobile-screen--items" aria-label="订阅内容列表">
          <header className="rss-mobile-topbar">
            <Button className="rss-mobile-topbar__back" aria-label="返回订阅源" icon={<IconChevronLeft />} theme="borderless" type="tertiary" onClick={onBackToSources} />
            <div className="rss-mobile-topbar__identity rss-mobile-topbar__identity--grow">
              <Text strong ellipsis={{ showTooltip: true }}>{sourceTitle}</Text>
              <Text size="small" type="tertiary">{itemCount} {itemCountUnit}</Text>
            </div>
            <div className="rss-mobile-topbar__actions">
              {itemsActions ?? <><Button
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
              /></>}
            </div>
          </header>
          {renderSearch()}
          <div className="rss-mobile-screen__body">{itemsContent}</div>
        </section>
      )}

      {view === 'detail' && (
        <section className="rss-mobile-screen rss-mobile-screen--detail" aria-label="订阅内容详情">
          <header className="rss-mobile-topbar rss-mobile-topbar--detail">
            <Button className="rss-mobile-topbar__back" aria-label="返回订阅内容列表" icon={<IconChevronLeft />} theme="borderless" type="tertiary" onClick={onBackToItems} />
            <div className="rss-mobile-topbar__identity rss-mobile-topbar__identity--grow">
              <Text strong ellipsis={{ showTooltip: true }}>{detailTitle ?? '订阅内容详情'}</Text>
              <Text size="small" type="tertiary">{detailStatus}</Text>
            </div>
            <div className="rss-mobile-topbar__actions">
              {detailActions ?? <><Button
                aria-label={bookmarked ? '取消收藏' : '收藏'}
                aria-pressed={bookmarked}
                className={bookmarked ? 'rss-bookmark-button--active' : ''}
                icon={<IconBookmark className={bookmarked ? 'rss-bookmark-icon--filled' : 'rss-bookmark-icon--empty'} />}
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
              {hasOriginalLink && <Button aria-label="打开原文" icon={<IconExternalOpen />} theme="borderless" type="tertiary" onClick={onOpenOriginal} />}
              </>}
            </div>
          </header>
          <div className="rss-mobile-screen__body">{detailContent}</div>
          {!detailIsDigest && <nav className="rss-mobile-reader-tools" aria-label="RSS 阅读工具">
            <Button
              aria-label="上一篇订阅内容"
              disabled={!hasPreviousItem}
              icon={<IconChevronLeft />}
              theme="borderless"
              type="tertiary"
              onClick={onOpenPreviousItem}
            >上一篇</Button>
            <Button
              aria-label="下一篇订阅内容"
              disabled={!hasNextItem}
              icon={<IconChevronRight />}
              theme="borderless"
              type="tertiary"
              onClick={onOpenNextItem}
            >下一篇</Button>
            <Button
              aria-label={activePanel ? '收起更多阅读工具' : '打开更多阅读工具'}
              aria-pressed={Boolean(activePanel)}
              className={activePanel ? 'rss-mobile-reader-tools__button--active' : ''}
              icon={<IconMore />}
              theme="borderless"
              type="tertiary"
              onClick={() => onChangePanel(activePanel ? null : 'ai')}
            >更多</Button>
          </nav>}
        </section>
      )}

      <SideSheet
        aria-label={activePanel ? `RSS 辅助工具：${panelLabels[activePanel]}` : 'RSS 辅助工具'}
        bodyStyle={{ padding: 0, overflow: 'hidden' }}
        className="mobile-reader-sheet mobile-assistant-sheet rss-mobile-sheet"
        closable={false}
        height="90dvh"
        mask
        maskClosable
        placement="bottom"
        visible={Boolean(activePanel)}
        zIndex={38}
        onCancel={() => onChangePanel(null)}
      >
        <div className="mobile-sheet-grabber" aria-hidden="true" />
        <div className="rss-mobile-sheet__content">{panelContent}</div>
        <nav className="mobile-panel-tabs rss-mobile-panel-tabs" aria-label="RSS 辅助工具切换">
          <Button
            aria-pressed={activePanel === 'ai'}
            className={activePanel === 'ai' ? 'rss-mobile-panel-tabs__button--active' : ''}
            icon={<IconAIStrokedLevel1 />}
            theme="borderless"
            type="tertiary"
            onClick={() => onChangePanel('ai')}
          >AI</Button>
          <Button
            aria-pressed={activePanel === 'style'}
            className={activePanel === 'style' ? 'rss-mobile-panel-tabs__button--active' : ''}
            icon={<IconColorPalette />}
            theme="borderless"
            type="tertiary"
            onClick={() => onChangePanel('style')}
          >样式</Button>
          <Button
            aria-pressed={activePanel === 'timeline'}
            className={activePanel === 'timeline' ? 'rss-mobile-panel-tabs__button--active' : ''}
            icon={<IconCalendarClock />}
            theme="borderless"
            type="tertiary"
            onClick={() => onChangePanel('timeline')}
          >时间线</Button>
        </nav>
      </SideSheet>
    </div>
  );
}
