import { useState, type FormEvent } from 'react';
import { Button, Input, Toast, Typography } from '@douyinfe/semi-ui';
import { AppFormModal } from '../../../../components/AppFormModal';
import { videosApi } from '../../../../api/videos';
import { useLearningStore } from '../../../../store/useLearningStore';
import type { VideoResource } from '../../../../../contracts/videos';
const { Text } = Typography;
export function AddVideoDialog({
  visible,
  onClose,
  onAdded,
}: {
  visible: boolean;
  onClose: () => void;
  onAdded: (video: VideoResource) => void;
}) {
  const videos = useLearningStore((state) => state.videoResources);
  const upsertVideoResource = useLearningStore((state) => state.upsertVideoResource);
  const [videoUrl, setVideoUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const addVideo = async (event: FormEvent) => {
    event.preventDefault();
    if (!videoUrl.trim()) return;
    setSubmitting(true);
    try {
      const imported = await videosApi.importYouTubeVideo({ url: videoUrl.trim() });
      const existing = videos.find((video) => video.youtubeVideoId === imported.youtubeVideoId);
      const timestamp = Date.now();
      const video: VideoResource = {
        ...imported,
        id: existing?.id ?? imported.youtubeVideoId,
        ...(existing?.lastPositionSeconds
          ? { lastPositionSeconds: existing.lastPositionSeconds }
          : {}),
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      upsertVideoResource(video);
      onAdded(video);
      setVideoUrl('');
      onClose();
      Toast.success(existing ? '已更新视频资料和字幕' : '视频资料已添加');
      if (video.captions.error) Toast.warning(video.captions.error);
    } catch (error) {
      Toast.error(error instanceof Error ? error.message : '添加视频失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppFormModal
      closable={false}
      title="添加 YouTube 视频"
      visible={visible}
      onCancel={() => {
        if (!submitting) onClose();
      }}
    >
      <form className="video-add-form" onSubmit={addVideo}>
        <label>
          <Text strong>YouTube 视频链接</Text>
          <Input
            autoFocus
            disabled={submitting}
            placeholder="https://www.youtube.com/watch?v=..."
            value={videoUrl}
            onChange={setVideoUrl}
          />
        </label>
        <Text size="small" type="tertiary">
          视频不会下载到服务器；仅保存标题、频道、字幕和学习记录。中文字幕会优先使用 YouTube
          提供的翻译。
        </Text>
        <div className="video-add-form__actions justify-end [margin-top:4px]">
          <Button
            disabled={submitting}
            theme="borderless"
            type="tertiary"
            onClick={() => onClose()}
          >
            取消
          </Button>
          <Button
            disabled={!videoUrl.trim()}
            htmlType="submit"
            loading={submitting}
            theme="solid"
            type="primary"
          >
            读取视频
          </Button>
        </div>
      </form>
    </AppFormModal>
  );
}
