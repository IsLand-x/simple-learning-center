import { IconPlus } from '@douyinfe/semi-icons';
import { Button, Empty, Tooltip, Typography } from '@douyinfe/semi-ui';
import { useMemo } from 'react';
import type { VideoResource } from '../../../../util/types';
import { formatVideoTime } from '../store/model/videoTranscript';
const { Text } = Typography;
export function VideoLibrary({
  videos,
  selectedVideoId,
  onAdd,
  onSelect,
}: {
  videos: VideoResource[];
  selectedVideoId?: string;
  onAdd: () => void;
  onSelect: (video: VideoResource) => void;
}) {
  const groups = useMemo(() => {
    const result = new Map<string, VideoResource[]>();
    for (const video of videos) {
      const key = video.channelTitle || '未知频道';
      result.set(key, [...(result.get(key) ?? []), video]);
    }
    return [...result.entries()];
  }, [videos]);

  return (
    <section
      className="video-library w-full min-w-0 min-h-0 overflow-hidden [background:var(--semi-color-bg-0)]"
      aria-label="视频资料"
    >
      <div className="video-panel-header [min-height:44px] [flex:0_0_44px] [padding:0_8px_0_12px] [background:var(--semi-color-bg-1)]">
        <Text strong>视频资料</Text>
        <Tooltip content="添加视频">
          <Button
            aria-label="添加 YouTube 视频"
            icon={<IconPlus />}
            size="small"
            theme="borderless"
            type="tertiary"
            onClick={onAdd}
          />
        </Tooltip>
      </div>
      <div className="video-library__list min-h-0 [padding:8px_6px_16px] mobile:[padding:10px_10px_20px]">
        {groups.length ? (
          groups.map(([channel, channelVideos]) => (
            <section key={channel} className="video-channel-group">
              <Text
                className="video-channel-group__title block [padding:4px_8px_6px]"
                size="small"
                type="tertiary"
                ellipsis={{ showTooltip: true }}
              >
                {channel}
              </Text>
              {channelVideos.map((video) => (
                <button
                  key={video.id}
                  type="button"
                  aria-current={video.id === selectedVideoId ? 'page' : undefined}
                  className={`video-resource-row w-full [min-height:42px] [grid-template-columns:minmax(0,_1fr)_auto] [padding:6px_8px] [color:var(--semi-color-text-1)] [background:transparent] [text-align:left] mobile:[min-height:52px] mobile:[padding:8px_10px] mobile:[touch-action:manipulation] ${video.id === selectedVideoId ? ' video-resource-row--active' : ''}`}
                  onClick={() => onSelect(video)}
                >
                  <span className="video-resource-row__title min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                    {video.title}
                  </span>
                  <span className="video-resource-row__meta [color:var(--semi-color-text-2)]">
                    {formatVideoTime(video.durationSeconds)}
                  </span>
                </button>
              ))}
            </section>
          ))
        ) : (
          <Empty title="还没有视频资料" description="点击右上角加号，粘贴 YouTube 链接开始学习" />
        )}
      </div>
    </section>
  );
}
