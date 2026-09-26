import { IconAIStrokedLevel1, IconCalendarClock, IconColorPalette } from '@douyinfe/semi-icons';
import { Button, SideSheet, Typography } from '@douyinfe/semi-ui';
import { ReaderStylePanel } from '../../../../../components/reading/ReaderStylePanel';
import { useLearningStore } from '../../../../../store/useLearningStore';
import type { RssMobilePanel } from '../../store/navigation';
import { useWorkspace } from '../../store/WorkspaceContext';
import { RssRightPanel } from '../AssistantPanel/RssRightPanel';
const { Text } = Typography;
const panelLabels: Record<Exclude<RssMobilePanel, null>, string> = {
  style: '样式',
  ai: 'AI',
  timeline: '时间线',
};

export function MobileAssistantSheet() {
  const persistedFeeds = useLearningStore((state) => state.rssFeeds);
  const persistedReaderPreferences = useLearningStore((state) => state.readerPreferences);
  const persistedSetReaderPreferences = useLearningStore((state) => state.setReaderPreferences);
  const { article, navigation: workspace } = useWorkspace();

  const activePanel = workspace.mobilePanel;
  const panelContent =
    workspace.mobilePanel === 'style' ? (
      <aside
        className="right-panel w-full min-h-0 overflow-hidden [background:var(--semi-color-bg-1)] min-w-0 [max-width:none] mobile-style-panel rss-mobile-style-panel"
        aria-label="阅读样式"
      >
        <div className="panel-titlebar [height:var(--reader-bar-height)] [min-height:var(--reader-bar-height)] justify-between [padding:0_8px_0_12px]">
          <div className="panel-titlebar__title min-w-0 [color:var(--semi-color-text-1)]">
            <IconColorPalette size="large" className="panel-tool-icon" />
            <Text strong>阅读样式</Text>
          </div>
        </div>
        <div className="mobile-style-panel__body mobile:min-h-0 mobile:overflow-auto rss-mobile-style-panel__body mobile:min-h-0 mobile:overflow-auto">
          <ReaderStylePanel
            preferences={persistedReaderPreferences}
            onChangePreferences={persistedSetReaderPreferences}
          />
        </div>
      </aside>
    ) : workspace.mobilePanel ? (
      <RssRightPanel
        activePanel={workspace.mobilePanel}
        item={workspace.selectedItem}
        items={workspace.filteredItems}
        feeds={persistedFeeds}
        query={workspace.query}
        selectedText={article.aiQuote}
        onClearSelectedText={article.clearAiQuote}
      />
    ) : null;
  const onChangePanel = workspace.changeMobilePanel;
  return (
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
  );
}
