import { IconArrowLeft } from '@douyinfe/semi-icons';
import { Button, Empty, Input, Typography } from '@douyinfe/semi-ui';
import { Allotment } from 'allotment';
import { AppFormModal } from '../../../components/AppFormModal';
import { clamp } from '../../../util/format';
import { VideoActivityBar } from './components/VideoActivityBar';
import { VideoLibrary } from './components/VideoLibrary';
import { VideoMainContent } from './components/VideoMainContent';
import { VideoRightPanel } from './components/VideoRightPanel';
import { useVideoPageStore } from './store/useVideoPageStore';

const { Text, Title } = Typography;

export function VideoStudyPage() {
  const page = useVideoPageStore();

  const library = (
    <VideoLibrary
      videos={page.videos}
      selectedVideoId={page.selectedVideo?.id}
      onAdd={() => page.setAddVisible(true)}
      onSelect={page.selectVideo}
    />
  );

  const mainContent = page.selectedVideo ? (
    <VideoMainContent
      video={page.selectedVideo}
      studyNote={page.studyNote}
      playerRef={page.playerRef}
      onChangeCurrentTime={page.handleTimeUpdate}
      onChangeStudyNote={page.changeStudyNote}
      onDeleteVideo={page.removeSelectedVideo}
    />
  ) : (
    <div className="video-detail-empty w-full [place-items:center] [padding:24px]">
      <Empty
        title="选择或添加一个视频"
        description="视频只通过 YouTube 播放，服务器仅保存元数据、字幕和学习记录"
      />
    </div>
  );

  const rightPanel =
    page.selectedVideo && page.activePanel ? (
      <VideoRightPanel
        panel={page.activePanel}
        video={page.selectedVideo}
        currentTime={page.currentTime}
        transcriptMode={page.transcriptMode}
        onChangeTranscriptMode={page.setTranscriptMode}
        onSeek={page.seekTo}
      />
    ) : null;

  return (
    <main className="video-page w-full min-w-0 min-h-0 overflow-hidden [background:var(--semi-color-bg-0)]">
      <header className="video-page__header [min-height:52px] [padding:0_14px_0_16px] [background:var(--semi-color-bg-1)] mobile:[min-height:58px] mobile:[padding:0_max(8px,_env(safe-area-inset-right))_0_max(8px,_env(safe-area-inset-left))]">
        {page.mobileLayout && page.selectedVideo && (
          <Button
            aria-label="返回视频资料"
            className="video-page__back"
            icon={<IconArrowLeft />}
            theme="borderless"
            type="tertiary"
            onClick={() => page.setSearchParams({}, { replace: true })}
          />
        )}
        <div className="video-page__heading min-w-0 [align-items:baseline]">
          <Title heading={5}>视频学习</Title>
          <Text size="small" type="tertiary">
            {page.videos.length} 个视频
          </Text>
        </div>
      </header>

      <div className="video-page__workspace w-full min-w-0 min-h-0 overflow-hidden">
        {page.mobileLayout ? (
          page.selectedVideo ? (
            <div className="video-mobile-workspace mobile:h-full mobile:min-w-0 mobile:min-h-0 mobile:overflow-hidden">
              <div className="video-mobile-workspace__main mobile:min-h-0 mobile:[flex:0_1_54%] mobile:overflow-auto mobile:[border-bottom:1px_solid_var(--semi-color-border)]">
                {mainContent}
              </div>
              <div className="video-mobile-workspace__panel mobile:min-h-0 mobile:[flex:1_1_46%] mobile:overflow-hidden">
                {rightPanel}
              </div>
              <VideoActivityBar panel={page.activePanel} onChange={page.setActivePanel} />
            </div>
          ) : (
            library
          )
        ) : (
          <Allotment className="video-allotment w-full min-w-0 min-h-0">
            <Allotment.Pane
              minSize={160}
              preferredSize={page.compactLayout ? 180 : 240}
              maxSize={page.compactLayout ? 280 : 340}
            >
              {library}
            </Allotment.Pane>
            <Allotment.Pane minSize={540}>
              <section className="video-detail-layout w-full min-w-0 min-h-0 overflow-hidden">
                <Allotment
                  proportionalLayout={false}
                  separator={Boolean(page.activePanel)}
                  onDragEnd={(sizes) => {
                    if (page.activePanel && sizes[1])
                      page.setVideoPanelWidth(clamp(sizes[1], page.compactLayout ? 280 : 320, 720));
                  }}
                >
                  <Allotment.Pane minSize={page.compactLayout ? 300 : 420}>
                    {mainContent}
                  </Allotment.Pane>
                  <Allotment.Pane
                    visible={Boolean(page.activePanel)}
                    preferredSize={page.videoPanelWidth}
                    minSize={page.compactLayout ? 280 : 320}
                    maxSize={720}
                  >
                    {rightPanel}
                  </Allotment.Pane>
                </Allotment>
                <VideoActivityBar
                  panel={page.activePanel}
                  onChange={(panel) =>
                    page.setActivePanel((current) => (current === panel ? null : panel))
                  }
                />
              </section>
            </Allotment.Pane>
          </Allotment>
        )}
      </div>

      <AppFormModal
        closable={false}
        title="添加 YouTube 视频"
        visible={page.addVisible}
        onCancel={() => {
          if (!page.submitting) page.setAddVisible(false);
        }}
      >
        <form className="video-add-form" onSubmit={page.addVideo}>
          <label>
            <Text strong>YouTube 视频链接</Text>
            <Input
              autoFocus
              disabled={page.submitting}
              placeholder="https://www.youtube.com/watch?v=..."
              value={page.videoUrl}
              onChange={page.setVideoUrl}
            />
          </label>
          <Text size="small" type="tertiary">
            视频不会下载到服务器；仅保存标题、频道、字幕和学习记录。中文字幕会优先使用 YouTube
            提供的翻译。
          </Text>
          <div className="video-add-form__actions justify-end [margin-top:4px]">
            <Button
              disabled={page.submitting}
              theme="borderless"
              type="tertiary"
              onClick={() => page.setAddVisible(false)}
            >
              取消
            </Button>
            <Button
              disabled={!page.videoUrl.trim()}
              htmlType="submit"
              loading={page.submitting}
              theme="solid"
              type="primary"
            >
              读取视频
            </Button>
          </div>
        </form>
      </AppFormModal>
    </main>
  );
}
