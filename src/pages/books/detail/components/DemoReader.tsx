import { Typography } from '@douyinfe/semi-ui';
import { READER_FONT_STACKS } from '../../../../util/reading/readerFonts';
import type { ReaderSurfaceProps, ReaderSurfaceHandle } from '../store/model/readerSurfaceTypes';
import { useDemoReader } from '../store/useDemoReader';
import { DemoHighlightedText } from './DemoHighlightedText';

const { Text } = Typography;

export function DemoReader(
  props: ReaderSurfaceProps & { controllerRef: React.Ref<ReaderSurfaceHandle> },
) {
  const { preferences, compactLayout, onHighlightClick } = props;
  const {
    readerRootRef,
    readerCssVariables,
    readerStyle,
    readerTextureStyle,
    handleMouseUp,
    handleClick,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    swipeStartRef,
    content,
    chapter,
    chapterHighlights,
  } = useDemoReader(props);
  return (
    <div
      ref={readerRootRef}
      className={`demo-reader [overscroll-behavior-x:contain] [touch-action:pan-y] [transition:color_180ms_ease,_background-color_180ms_ease] demo-reader--${preferences.theme}`}
      style={{
        ...readerCssVariables,
        color: readerStyle.textColor,
        backgroundColor: readerStyle.paperColor,
        ...readerTextureStyle,
      }}
      onMouseUp={handleMouseUp}
      onClick={handleClick}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        swipeStartRef.current = null;
      }}
    >
      <article
        style={{
          fontSize: readerStyle.fontSize,
          lineHeight: readerStyle.density.lineHeight,
          letterSpacing: readerStyle.density.letterSpacing,
          fontFamily: READER_FONT_STACKS[readerStyle.fontFamily],
          paddingLeft: compactLayout ? 'clamp(14px, 4vw, 20px)' : readerStyle.density.pagePadding,
          paddingRight: compactLayout ? 'clamp(14px, 4vw, 20px)' : readerStyle.density.pagePadding,
        }}
      >
        <Text className="reader-eyebrow [color:var(--reader-muted-color)]! [letter-spacing:0.08em]">
          {content.eyebrow}
        </Text>
        <h1>{content.heading}</h1>
        {content.paragraphs.map((paragraph, index) => (
          <p key={`${chapter?.id}-${index}`}>
            <DemoHighlightedText
              text={paragraph}
              highlights={chapterHighlights}
              onHighlightClick={onHighlightClick}
            />
          </p>
        ))}
        <aside className="reader-callout [margin-top:32px] [padding:16px_18px] [border-left:3px_solid_var(--reader-accent-color)] [background:var(--reader-callout-color)]">
          <strong>阅读提示</strong>
          <p>选中任意一段文字，即可高亮收藏或放入 AI 提问区。</p>
        </aside>
      </article>
    </div>
  );
}
