import { Spin, Typography } from '@douyinfe/semi-ui';

export function BookShareLoading({
  text,
  fullScreen = true,
}: {
  text: string;
  fullScreen?: boolean;
}) {
  return (
    <div
      role="status"
      aria-label={text}
      className={`book-share-page flex min-h-0 items-center justify-center gap-3 [background:var(--semi-color-bg-0)] [color:var(--semi-color-text-0)] ${fullScreen ? 'h-dvh' : 'h-full'}`}
    >
      <Spin />
      <Typography.Text type="tertiary" className="whitespace-nowrap">
        {text}
      </Typography.Text>
    </div>
  );
}
