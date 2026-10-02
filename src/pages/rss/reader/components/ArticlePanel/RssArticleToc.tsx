import { Typography } from '@douyinfe/semi-ui';
import { type CSSProperties } from 'react';
import { type RssContentHeading } from './rssContent';

const { Text } = Typography;

export function RssArticleToc({
  activeHeadingId,
  headings,
  onSelect,
  style,
}: {
  activeHeadingId?: string;
  headings: RssContentHeading[];
  onSelect: (headingId: string) => void;
  style: CSSProperties;
}) {
  if (!headings.length) return null;
  const minimumLevel = Math.min(...headings.map((heading) => heading.level));
  return (
    <nav
      className="rss-article-toc absolute [z-index:2] [top:50%] [left:12px] [width:32px] [max-height:min(72%,_560px)] [padding:6px_4px] [background:transparent] [scrollbar-width:none] [transform:translateY(-50%)] [transition:color_160ms_ease,_background-color_160ms_ease,_border-color_160ms_ease,_box-shadow_160ms_ease] [@media(max-width:1200px)]:hidden"
      aria-label="文章目录"
      style={style}
    >
      <Text
        className="rss-article-toc__title [padding:0_8px_8px] [color:var(--rss-toc-muted-color)]!"
        size="small"
        type="tertiary"
      >
        目录
      </Text>
      <div className="rss-article-toc__list">
        {headings.map((heading) => (
          <button
            aria-current={activeHeadingId === heading.id ? 'location' : undefined}
            className={`rss-article-toc__item [width:24px] [min-height:14px] justify-center [padding:0] [color:var(--rss-toc-muted-color)] [background:transparent] [text-align:left] ${activeHeadingId === heading.id ? ' rss-article-toc__item--active' : ''}`}
            key={heading.id}
            style={{ '--rss-toc-depth': heading.level - minimumLevel } as CSSProperties}
            title={heading.text}
            type="button"
            onClick={() => onSelect(heading.id)}
          >
            <span
              aria-hidden="true"
              className="rss-article-toc__indicator [width:max(5px,_calc(9px_-_var(--rss-toc-depth,_0)_*_2px))] [height:1px] [justify-self:center] [border-radius:9999px] [background:color-mix(in_srgb,_var(--rss-toc-muted-color)_58%,_transparent)] [transition:width_160ms_ease,_height_160ms_ease,_background-color_160ms_ease]"
            />
            <span>{heading.text}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
