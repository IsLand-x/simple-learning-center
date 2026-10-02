import { useMemo, type CSSProperties } from 'react';
import type { ReaderPreferences } from '../../../../../../contracts/reading';
import type { RssAnnotation, RssFeed, RssItem } from '../../../../../../contracts/rss';
import { READER_FONT_STACKS } from '../../../../../util/reading/readerFonts';
import {
  getReaderTextureStyle,
  resolveReaderStyle,
} from '../../../../../util/reading/readerThemes';
import type { RssVideoPresentation } from '../rssVideo';
import {
  extractRssContentHeadings,
  removeRssLeadingCover,
  sanitizeRssContentHtml,
} from './rssContent';

type CssVariables = CSSProperties & Record<`--${string}`, string | number>;
interface ArticlePresentationInput {
  readerPreferences: ReaderPreferences;
  selectedItem?: RssItem;
  selectedFeed?: RssFeed;
  selectedAnnotations: RssAnnotation[];
  query: string;
  isSelectedVideo: boolean;
  translationVisible: boolean;
  selectedVideoPresentation: RssVideoPresentation | null | undefined;
}
export function useRssArticlePresentation({
  readerPreferences,
  selectedItem,
  selectedFeed,
  selectedAnnotations,
  query,
  isSelectedVideo,
  translationVisible,
  selectedVideoPresentation,
}: ArticlePresentationInput) {
  const readerStyle = useMemo(() => resolveReaderStyle(readerPreferences), [readerPreferences]);
  const articleStyle = useMemo(
    () =>
      ({
        ...getReaderTextureStyle(readerStyle.texture, readerStyle.isDark),
        backgroundColor: readerStyle.paperColor,
        color: readerStyle.textColor,
        fontFamily: READER_FONT_STACKS[readerStyle.fontFamily],
        fontSize: `${readerStyle.fontSize}px`,
        lineHeight: readerStyle.density.lineHeight,
        letterSpacing: readerStyle.density.letterSpacing,
        '--rss-reader-accent-color': readerStyle.accentColor,
        '--rss-reader-callout-color': readerStyle.calloutColor,
        '--rss-reader-muted-color': readerStyle.mutedTextColor,
        '--rss-reader-paragraph-spacing': `${readerStyle.density.paragraphSpacing}em`,
        '--rss-reader-text-color': readerStyle.textColor,
      }) as CssVariables,
    [readerStyle],
  );
  const articleTocStyle = useMemo(
    () =>
      ({
        '--rss-toc-accent-color': readerStyle.accentColor,
        '--rss-toc-callout-color': readerStyle.calloutColor,
        '--rss-toc-muted-color': readerStyle.mutedTextColor,
        '--rss-toc-paper-color': readerStyle.paperColor,
        '--rss-toc-text-color': readerStyle.textColor,
      }) as CssVariables,
    [readerStyle],
  );
  const articleBaseUrl =
    selectedItem?.fullContentUrl ||
    selectedItem?.link ||
    selectedFeed?.siteUrl ||
    selectedFeed?.url ||
    window.location.href;
  const selectedContent = isSelectedVideo
    ? selectedItem?.contentHtml || selectedItem?.contentText
    : selectedItem?.fullContentHtml ||
      selectedItem?.contentHtml ||
      selectedItem?.fullContentText ||
      selectedItem?.contentText;
  const sanitizedContentHtml = useMemo(
    () =>
      removeRssLeadingCover(
        sanitizeRssContentHtml(selectedContent, articleBaseUrl, query, selectedAnnotations),
        selectedVideoPresentation?.embedUrl ? selectedVideoPresentation.imageUrl : undefined,
      ),
    [
      articleBaseUrl,
      query,
      selectedAnnotations,
      selectedContent,
      selectedVideoPresentation?.embedUrl,
      selectedVideoPresentation?.imageUrl,
    ],
  );
  const sanitizedContentMarkup = useMemo(
    () => ({ __html: sanitizedContentHtml }),
    [sanitizedContentHtml],
  );
  const articleHeadings = useMemo(
    () => extractRssContentHeadings(sanitizedContentHtml),
    [sanitizedContentHtml],
  );
  const sanitizedTranslationHtml = useMemo(
    () => sanitizeRssContentHtml(selectedItem?.aiTranslationHtml, articleBaseUrl, query),
    [articleBaseUrl, query, selectedItem?.aiTranslationHtml],
  );
  const sanitizedTranslationMarkup = useMemo(
    () => ({ __html: sanitizedTranslationHtml }),
    [sanitizedTranslationHtml],
  );
  const translationHeadings = useMemo(
    () => extractRssContentHeadings(sanitizedTranslationHtml),
    [sanitizedTranslationHtml],
  );
  const displayedArticleHeadings = useMemo(
    () =>
      isSelectedVideo
        ? []
        : translationVisible && sanitizedTranslationHtml
          ? translationHeadings
          : translationVisible
            ? []
            : articleHeadings,
    [
      articleHeadings,
      isSelectedVideo,
      sanitizedTranslationHtml,
      translationHeadings,
      translationVisible,
    ],
  );

  return {
    readerStyle,
    articleStyle,
    articleTocStyle,
    sanitizedContentHtml,
    sanitizedContentMarkup,
    sanitizedTranslationHtml,
    sanitizedTranslationMarkup,
    displayedArticleHeadings,
  };
}
