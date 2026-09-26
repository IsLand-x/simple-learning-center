import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
  type UIEvent as ReactUIEvent,
} from 'react';
import { Empty, Spin, Typography } from '@douyinfe/semi-ui';
import { IconAIStrokedLevel1, IconLanguage } from '@douyinfe/semi-icons';
import { CspSafeMarkdown } from '../../../../components/ai/CspSafeChatContent';
import type { RssVideoPresentation } from '../store/rssVideo';
import type { RssFeed, RssItem } from '../../../../types/domain';
import { feedTypeLabels, itemDateTime } from '../store/model/rssPageModel';
import { HighlightedText } from './HighlightedText';

const { Text, Title } = Typography;

export function RssItemArticle({
  articleBodyRef,
  articleRef,
  hasTranslation,
  isVideo,
  item,
  query,
  sanitizedContentHtml,
  sanitizedContentMarkup,
  sanitizedTranslationHtml,
  sanitizedTranslationMarkup,
  source,
  style,
  summaryError,
  summaryStatus,
  translationError,
  translationStatus,
  translationVisible,
  videoPresentation,
  onContentClick,
  onContentKeyDown,
  onScroll,
}: {
  articleBodyRef: RefObject<HTMLDivElement>;
  articleRef: RefObject<HTMLElement>;
  hasTranslation: boolean;
  isVideo: boolean;
  item: RssItem;
  query: string;
  sanitizedContentHtml: string;
  sanitizedContentMarkup: { __html: string };
  sanitizedTranslationHtml: string;
  sanitizedTranslationMarkup: { __html: string };
  source?: RssFeed;
  style: CSSProperties;
  summaryError: string;
  summaryStatus: 'idle' | 'unavailable' | 'generating' | 'ready' | 'error';
  translationError: string;
  translationStatus: 'idle' | 'unavailable' | 'generating' | 'ready' | 'error';
  translationVisible: boolean;
  videoPresentation?: RssVideoPresentation;
  onContentClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onContentKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  onScroll: (event: ReactUIEvent<HTMLElement>) => void;
}) {
  return (
    <article
      ref={articleRef}
      className={`rss-article min-h-0 w-full min-w-0 [padding:28px_clamp(20px,_5vw,_64px)_56px] [overscroll-behavior-x:none] [transition:color_180ms_ease,_background-color_180ms_ease] [word-break:break-word] ${isVideo ? ' rss-article--video' : ''}`}
      style={style}
      onScroll={onScroll}
    >
      <div className="rss-article__inner [max-width:820px] [margin-inline:auto]">
        <header className="rss-article__header w-full [max-width:760px] [margin-inline:auto]">
          <div className="rss-article__masthead min-w-0 justify-between [gap:16px] [padding:8px_0_7px] [border-top:3px_solid_color-mix(in_srgb,_var(--rss-reader-text-color)_86%,_transparent)] [border-bottom:1px_solid_color-mix(in_srgb,_var(--rss-reader-text-color)_28%,_transparent)] [color:var(--rss-reader-muted-color)] [letter-spacing:0.1em]">
            <span>
              <HighlightedText text={source?.title ?? '未知订阅源'} query={query} />
            </span>
            <span>{source ? feedTypeLabels[source.type] : '内容'}</span>
          </div>
          <Title className="rss-article__title" heading={3}>
            <HighlightedText text={item.title} query={query} />
          </Title>
          <div className="rss-article__byline [min-height:28px] [padding-bottom:16px] [border-bottom:1px_solid_color-mix(in_srgb,_var(--rss-reader-text-color)_20%,_transparent)]">
            <Text size="small" type="tertiary">
              <time>
                {item.publishedAtIsFallback ? '收录于 ' : ''}
                {itemDateTime(item.publishedAt)}
              </time>
              {item.author && (
                <>
                  {' '}
                  · <HighlightedText text={item.author} query={query} />
                </>
              )}
              {item.fullContentFetchedAt && <> · 已读取原文</>}
            </Text>
          </div>
        </header>
        {videoPresentation?.embedUrl && (
          <div className="rss-video-player w-full [aspect-ratio:16_/_9] overflow-hidden [margin:20px_0] [background:var(--semi-color-bg-1)]">
            <iframe
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              loading="eager"
              referrerPolicy="strict-origin-when-cross-origin"
              src={videoPresentation.embedUrl}
              title={`播放：${item.title}`}
            />
          </div>
        )}
        {isVideo ? (
          <section
            className="rss-video-description w-full [margin-top:18px] [padding-top:16px] [border-top:1px_solid_color-mix(in_srgb,_var(--rss-reader-text-color)_14%,_transparent)] [color:var(--rss-reader-text-color)]"
            aria-labelledby="rss-video-description-title"
          >
            <Text id="rss-video-description-title" strong>
              视频简介
            </Text>
            {translationVisible && translationStatus === 'generating' ? (
              <div
                className="rss-translation-status [min-height:72px] [margin:22px_0] [padding:14px_16px] [background:var(--rss-reader-callout-color)]"
                aria-live="polite"
              >
                <Spin size="small" />
                <Text type="tertiary">正在翻译视频简介…</Text>
              </div>
            ) : translationVisible && hasTranslation ? (
              sanitizedTranslationHtml ? (
                <div
                  ref={articleBodyRef}
                  className="rss-article__body w-full min-w-0 [max-width:720px] [margin-inline:auto] [color:var(--rss-reader-text-color)] [word-break:break-word] rss-article__body--rich rss-translation__content [color:var(--rss-reader-text-color)]"
                  dangerouslySetInnerHTML={sanitizedTranslationMarkup}
                  onClick={onContentClick}
                  onKeyDown={onContentKeyDown}
                />
              ) : (
                <CspSafeMarkdown
                  className="rss-translation__content [color:var(--rss-reader-text-color)]"
                  content={item.aiTranslation || ''}
                />
              )
            ) : translationVisible && translationStatus === 'error' ? (
              <Text type="danger">{translationError}</Text>
            ) : sanitizedContentHtml ? (
              <div
                ref={articleBodyRef}
                className="rss-article__body w-full min-w-0 [max-width:720px] [margin-inline:auto] [color:var(--rss-reader-text-color)] [word-break:break-word] rss-article__body--rich"
                dangerouslySetInnerHTML={sanitizedContentMarkup}
                onClick={onContentClick}
                onKeyDown={onContentKeyDown}
              />
            ) : (
              <Text size="small" type="tertiary">
                发布者没有填写视频简介。
              </Text>
            )}
          </section>
        ) : (
          <>
            <section
              className="rss-ai-summary w-full [max-width:720px] min-h-0 [margin:26px_auto] [padding:13px_0_16px] [border-top:3px_double_color-mix(in_srgb,_var(--rss-reader-accent-color)_76%,_transparent)] [border-bottom:1px_solid_color-mix(in_srgb,_var(--rss-reader-text-color)_24%,_transparent)] [background:transparent]"
              aria-live="polite"
            >
              <div className="rss-ai-summary__heading [color:var(--rss-reader-accent-color)] [letter-spacing:0.08em]">
                <IconAIStrokedLevel1 />
                <Text strong>AI 导读</Text>
              </div>
              {item.aiSummary && item.aiSummaryVersion === 2 ? (
                <p>{item.aiSummary}</p>
              ) : summaryStatus === 'generating' ? (
                <div className="rss-ai-summary__loading [margin-top:12px]">
                  <Spin size="small" />
                  <Text size="small" type="tertiary">
                    正在阅读并总结当前内容…
                  </Text>
                </div>
              ) : summaryStatus === 'unavailable' ? (
                <Text size="small" type="tertiary">
                  请先在设置页添加并选择模型，进入内容后会自动生成摘要。
                </Text>
              ) : summaryStatus === 'error' ? (
                <Text size="small" type="danger">
                  {summaryError}
                </Text>
              ) : null}
            </section>
            {translationVisible && translationStatus === 'generating' ? (
              <div
                className="rss-translation-status [min-height:72px] [margin:22px_0] [padding:14px_16px] [background:var(--rss-reader-callout-color)]"
                aria-live="polite"
              >
                <Spin size="small" />
                <Text type="tertiary">正在翻译当前页面…</Text>
              </div>
            ) : translationVisible && hasTranslation ? (
              <section
                className="rss-translation w-full [max-width:720px] [margin:26px_auto_0]"
                aria-label="当前页面中文翻译"
              >
                <div className="rss-translation__heading [margin-bottom:18px] [padding:9px_0_8px] [border-top:2px_solid_color-mix(in_srgb,_var(--rss-reader-text-color)_74%,_transparent)] [border-bottom:1px_solid_color-mix(in_srgb,_var(--rss-reader-text-color)_20%,_transparent)] [color:var(--rss-reader-accent-color)] [letter-spacing:0.06em]">
                  <IconLanguage />
                  <Text strong>中文翻译</Text>
                </div>
                {sanitizedTranslationHtml ? (
                  <div
                    ref={articleBodyRef}
                    className="rss-article__body w-full min-w-0 [max-width:720px] [margin-inline:auto] [color:var(--rss-reader-text-color)] [word-break:break-word] rss-article__body--rich rss-translation__content [color:var(--rss-reader-text-color)]"
                    dangerouslySetInnerHTML={sanitizedTranslationMarkup}
                    onClick={onContentClick}
                    onKeyDown={onContentKeyDown}
                  />
                ) : (
                  <CspSafeMarkdown
                    className="rss-translation__content [color:var(--rss-reader-text-color)]"
                    content={item.aiTranslation || ''}
                  />
                )}
              </section>
            ) : translationVisible && translationStatus === 'error' ? (
              <div className="rss-translation-status [min-height:72px] [margin:22px_0] [padding:14px_16px] [background:var(--rss-reader-callout-color)]">
                <Text type="danger">{translationError}</Text>
              </div>
            ) : sanitizedContentHtml ? (
              <div
                ref={articleBodyRef}
                className="rss-article__body w-full min-w-0 [max-width:720px] [margin-inline:auto] [color:var(--rss-reader-text-color)] [word-break:break-word] rss-article__body--rich"
                dangerouslySetInnerHTML={sanitizedContentMarkup}
                onClick={onContentClick}
                onKeyDown={onContentKeyDown}
              />
            ) : (
              <Empty
                title="订阅源没有提供正文"
                description="可以打开原文，或让 AI 根据已有摘要和页面链接继续了解"
              />
            )}
          </>
        )}
      </div>
    </article>
  );
}
