import { IconSearch } from '@douyinfe/semi-icons';
import { Input } from '@douyinfe/semi-ui';
import { useEffect, useState } from 'react';
import { useWorkspace } from '../../store/WorkspaceContext';
import { MobileAssistantSheet } from './MobileAssistantSheet';
import { MobileDetailView } from './MobileDetailView';
import { MobileItemsView } from './MobileItemsView';
import { MobileSourcesView } from './MobileSourcesView';
export function MobileWorkspace() {
  const {
    navigation: { mobileView: view, query, setQuery, setSelectedItemId },
  } = useWorkspace();
  const [searchOpen, setSearchOpen] = useState(Boolean(query));
  useEffect(() => {
    if (query) setSearchOpen(true);
    if (view === 'detail') setSearchOpen(false);
  }, [query, view]);
  const toggleSearch = () => setSearchOpen((current) => !current);
  const onChangeQuery = (value: string) => {
    setQuery(value);
    setSelectedItemId(null);
  };
  const search =
    view !== 'detail' && searchOpen ? (
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
        <MobileSourcesView searchOpen={searchOpen} toggleSearch={toggleSearch}>
          {search}
        </MobileSourcesView>
      )}
      {view === 'items' && (
        <MobileItemsView searchOpen={searchOpen} toggleSearch={toggleSearch}>
          {search}
        </MobileItemsView>
      )}
      {view === 'detail' && <MobileDetailView />}
      <MobileAssistantSheet />
    </div>
  );
}
