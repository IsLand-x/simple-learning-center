import type { DragStart, DragUpdate, DropResult, ResponderProvided } from '@hello-pangea/dnd';
import type * as React from 'react';
import type {
  RssAnnotation,
  RssDailyDigest,
  RssFeed,
  RssFolder,
  RssItem,
} from '../../../../../contracts/rss';
import type { ReaderHighlightTarget } from '../../../../types/reader';
import type { RssImageViewerImage } from '../components/ArticlePanel/RssImageViewer';
import type { RssContentHeading } from '../components/ArticlePanel/rssContent';
import type { RssReaderSelection } from '../components/ArticlePanel/useRssArticleAnnotations';
import type { RssVideoPresentation } from '../components/rssVideo';
import type { RssItemMenuState, RssSourceMenuState } from './menuTypes';
import type { RssMobilePanel, RssMobileView, RssSidePanel, TimeRange } from './navigation';

type CssVariables = React.CSSProperties & Record<`--${string}`, string | number>;
type TaskStatus = 'idle' | 'unavailable' | 'generating' | 'ready' | 'error';

interface WorkspaceNavigation {
  query: string;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  setSelectedItemId: (itemId: string | null) => void;
  compactLayout: boolean;
  mobileLayout: boolean;
  selectedDigest: RssDailyDigest | undefined;
  selectedItem: RssItem | undefined;
  hasSelectedTranslation: boolean;
  isSelectedVideo: boolean;
  selectedFeed: RssFeed | undefined;
  selectedVideoPresentation: RssVideoPresentation | undefined;
  markAutomaticallySelectedItemRead: (scrollContainer: HTMLElement) => void;
  activePanel: RssSidePanel;
  todayKey: string;
  setDigestSettingsVisible: React.Dispatch<React.SetStateAction<boolean>>;
  filteredItems: RssItem[];
  setActivePanel: React.Dispatch<React.SetStateAction<RssSidePanel>>;
  digestSettingsVisible: boolean;
  digestList: RssDailyDigest[];
  searchPreviews: Map<string, string>;
  selectedFeedId: string;
  timeRange: TimeRange;
  todayItems: RssItem[];
  openDigest: (digest: RssDailyDigest) => void;
  openItem: (item: RssItem) => void;
  setSourceMenu: React.Dispatch<React.SetStateAction<RssSourceMenuState | null>>;
  setItemMenu: React.Dispatch<React.SetStateAction<RssItemMenuState | null>>;
  selectRange: (range: TimeRange) => void;
  itemMenu: RssItemMenuState | null;
  selectedSourceTitle: string;
  unreadVisibleItems: RssItem[];
  mobilePanel: RssMobilePanel;
  changeMobilePanel: (panel: RssMobilePanel) => void;
  nextItem: RssItem | undefined;
  previousItem: RssItem | undefined;
  showMobileItems: () => void;
  showMobileSources: () => void;
  mobileView: RssMobileView;
  sourceMenu: RssSourceMenuState | null;
  selectSource: (sourceId: string) => void;
  setSelectedFeedId: (sourceId: string) => void;
}

interface WorkspaceSources {
  setAddVisible: React.Dispatch<React.SetStateAction<boolean>>;
  addVisible: boolean;
  folderVisible: boolean;
  setFolderVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setCreatedFolderId: React.Dispatch<React.SetStateAction<string>>;
  setExpandedFolders: React.Dispatch<React.SetStateAction<Set<string>>>;
  sourceActionsVisible: boolean;
  opmlInputRef: React.RefObject<HTMLInputElement>;
  setManageVisible: React.Dispatch<React.SetStateAction<boolean>>;
  refreshFeeds: (targets: RssFeed[], notify?: boolean) => Promise<void>;
  setSourceActionsVisible: React.Dispatch<React.SetStateAction<boolean>>;
  importOpml: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  manageVisible: boolean;
  confirmDeleteFeed: (feed: RssFeed) => void;
  confirmDeleteFolder: (folder: RssFolder) => void;
  refreshFeed: (feed: RssFeed) => Promise<boolean>;
  expandedFolders: Set<string>;
  refreshingIds: Set<string>;
  handleSourceDragStart: (start: DragStart<string>, provided: ResponderProvided) => void;
  handleSourceDragUpdate: (update: DragUpdate<string>, provided: ResponderProvided) => void;
  handleSourceDragEnd: (result: DropResult<string>, provided: ResponderProvided) => void;
  createdFolderId: string;
  submitting: boolean;
}

interface WorkspaceArticle {
  articleStyle: CssVariables;
  articleBodyRef: React.RefObject<HTMLDivElement>;
  articleRef: React.RefObject<HTMLElement>;
  sanitizedContentHtml: string;
  sanitizedContentMarkup: { __html: string };
  sanitizedTranslationHtml: string;
  sanitizedTranslationMarkup: { __html: string };
  translationVisible: boolean;
  handleArticleContentClick: (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;
  handleArticleContentKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  setRssSelection: React.Dispatch<React.SetStateAction<RssReaderSelection | null>>;
  setActiveAnnotationTarget: React.Dispatch<React.SetStateAction<ReaderHighlightTarget | null>>;
  syncActiveHeading: (article: HTMLElement) => void;
  setShowScrolledTitle: React.Dispatch<React.SetStateAction<boolean>>;
  imageViewer: RssImageViewerImage | null;
  setImageViewer: React.Dispatch<React.SetStateAction<RssImageViewerImage | null>>;
  activeAnnotation: RssAnnotation | undefined;
  activeAnnotationTarget: ReaderHighlightTarget | null;
  commentDraft: string;
  commentingAnnotationId: string | null;
  pendingCommentSelection: RssReaderSelection | null;
  rssSelection: RssReaderSelection | null;
  askAboutRssSelection: () => void;
  cancelCommentEditing: () => void;
  deleteActiveAnnotation: () => void;
  setCommentDraft: React.Dispatch<React.SetStateAction<string>>;
  createRssComment: () => void;
  editAnnotationComment: () => void;
  saveRssHighlight: () => void;
  saveRssComment: () => void;
  fetchingArticleIds: Set<string>;
  showScrolledTitle: boolean;
  stylePopoverVisible: boolean;
  videoImporting: boolean;
  fetchArticleContent: (item: RssItem) => Promise<boolean>;
  importSelectedYouTubeVideo: () => Promise<void>;
  setStylePopoverVisible: React.Dispatch<React.SetStateAction<boolean>>;
  activeHeadingId: string | undefined;
  displayedArticleHeadings: RssContentHeading[];
  articleTocStyle: CssVariables;
  jumpToHeading: (headingId: string) => void;
  selectedAnnotations: RssAnnotation[];
  aiQuote: string | undefined;
  clearAiQuote: () => void;
  jumpToAnnotation: (annotation: RssAnnotation) => void;
}

interface WorkspaceTasks {
  digestError: string;
  digestGenerating: boolean;
  runDigest: (date?: string) => Promise<void>;
  summaryError: string;
  summaryStatus: TaskStatus;
  translationError: string;
  translationStatus: TaskStatus;
  translateCurrentPage: () => Promise<undefined>;
}

/** Only state and commands shared by mounted RSS regions belong to this boundary. */
export interface WorkspaceContextValue {
  navigation: WorkspaceNavigation;
  sources: WorkspaceSources;
  article: WorkspaceArticle;
  tasks: WorkspaceTasks;
}
