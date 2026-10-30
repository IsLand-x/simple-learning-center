import { generateChapterMindMap } from '../mindmaps/generate.js';
import { generateChapterVideo } from '../chapterVideos/generate.js';
import { removeChapterVideoFiles } from '../../books/chapterVideos.js';
import type { AiJob, AiChatContext, AiChatRunner, AiResult } from './types.js';
import { persistAssistant } from './persistence.js';
import { isCancelled, safeErrorMessage } from './model.js';

interface ExecutionDependencies {
  runChat: AiChatRunner;
  publishJob: (job: AiJob) => void;
  pruneJobs: () => void;
}

export function createJobExecutor({ runChat, publishJob, pruneJobs }: ExecutionDependencies) {
  async function executeJob(job: AiJob, context: AiChatContext) {
    if (isCancelled(job)) return;
    job.status = 'running';
    job.updatedAt = Date.now();
    job.revision += 1;
    publishJob(job);
    let generatedVideo: AiResult['chapterVideo'];
    try {
      const reportProgress = (progress: AiResult) => {
        if (isCancelled(job)) return;
        job.content = progress.content;
        job.dialogueContent = structuredClone(progress.dialogueContent);
        job.updatedAt = Date.now();
        job.revision += 1;
        publishJob(job);
      };
      const rawResult: AiResult =
        job.purpose === 'mindmap'
          ? {
              content: '章节思维导图已生成',
              dialogueContent: [],
              mindMap: await generateChapterMindMap(
                context,
                job.chapterId!,
                runChat,
                job.controller.signal,
                reportProgress,
              ),
            }
          : job.purpose === 'chapter-video'
            ? {
                content: '章节视频已生成',
                dialogueContent: [],
                chapterVideo: await generateChapterVideo(
                  context,
                  job.chapterId,
                  runChat,
                  job.controller.signal,
                  reportProgress,
                ),
              }
            : await runChat({
                ...context,
                signal: job.controller.signal,
                onProgress(progress) {
                  if (isCancelled(job)) return;
                  job.content = progress.content;
                  job.dialogueContent = structuredClone(progress.dialogueContent);
                  job.updatedAt = Date.now();
                  job.revision += 1;
                  publishJob(job);
                },
                onNoteChange() {
                  job.notesRevision += 1;
                  job.updatedAt = Date.now();
                  job.revision += 1;
                  publishJob(job);
                },
              });
      generatedVideo = rawResult.chapterVideo;
      if (job.controller.signal.aborted || isCancelled(job)) return;
      const result = rawResult;
      job.finalResult = structuredClone(result);
      if (job.purpose === 'chapter-video') job.committing = true;
      await persistAssistant(job, result);
      job.content = result.content;
      job.dialogueContent = structuredClone(result.dialogueContent);
      job.status = 'completed';
      job.completedAt = Date.now();
      job.updatedAt = job.completedAt;
      job.revision += 1;
      publishJob(job);
    } catch (error) {
      if (
        job.controller.signal.aborted ||
        isCancelled(job) ||
        (error as { name?: unknown } | null)?.name === 'AbortError'
      ) {
        job.status = 'cancelled';
        job.error = undefined;
      } else {
        job.status = 'failed';
        job.error = safeErrorMessage(error, [
          context.config.apiKey,
          context.webSearchConfig.apiKey,
          context.videoNarration?.config.apiKey,
        ]);
        console.error(`AI task ${job.id} failed`);
      }
      job.completedAt = Date.now();
      job.updatedAt = job.completedAt;
      job.revision += 1;
      publishJob(job);
    } finally {
      if (generatedVideo && job.status !== 'completed')
        await removeChapterVideoFiles(generatedVideo.bookId, generatedVideo.id).catch(
          () => undefined,
        );
      pruneJobs();
    }
  }
  return executeJob;
}
