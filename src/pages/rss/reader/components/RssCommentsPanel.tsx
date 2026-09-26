import { Empty, Typography } from '@douyinfe/semi-ui';
import { formatRelativeTime } from '../../../../util/format';
import type { RssAnnotation } from '../../../../util/types';

const { Text } = Typography;

export function RssCommentsPanel({
  annotations,
  onJumpAnnotation,
}: {
  annotations: RssAnnotation[];
  onJumpAnnotation: (annotation: RssAnnotation) => void;
}) {
  const comments = annotations
    .filter((annotation) => annotation.comment?.trim())
    .sort(
      (left, right) =>
        (right.commentUpdatedAt ?? right.createdAt) - (left.commentUpdatedAt ?? left.createdAt),
    );
  return (
    <div className="right-panel__body min-h-0 comments-panel rss-comments-panel min-h-0">
      {comments.length ? (
        comments.map((annotation) => (
          <article
            className="comment-card [padding:12px] [background:var(--semi-color-bg-0)] [transition:background-color_160ms_ease,_border-color_160ms_ease]"
            key={annotation.id}
            role="button"
            tabIndex={0}
            onClick={() => onJumpAnnotation(annotation)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              onJumpAnnotation(annotation);
            }}
          >
            <blockquote>{annotation.text}</blockquote>
            <p>{annotation.comment}</p>
            <div className="comment-card__footer justify-between [margin-top:10px]">
              <Text size="small" type="tertiary">
                文章评论
              </Text>
              <Text size="small" type="tertiary">
                {formatRelativeTime(annotation.commentUpdatedAt ?? annotation.createdAt)}
              </Text>
            </div>
          </article>
        ))
      ) : (
        <Empty title="还没有评论" description="在正文中选择文字并添加评论后，会集中显示在这里" />
      )}
    </div>
  );
}
