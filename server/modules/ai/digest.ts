import { randomUUID } from 'node:crypto';
import type { AiJob, DigestInput, DigestAttempt } from './jobs/types.js';
import type { createJobStarter } from './jobs/start.js';
import { statusError } from '../../infrastructure/http/errors.js';
import { readPersistedState, mutatePersistedState } from '../state/stateStore.js';
import { optionalString, publicJob, upsertDigestRun } from './jobs/model.js';

export function createDigestStarter({
  jobs,
  start,
}: {
  jobs: Map<string, AiJob>;
  start: ReturnType<typeof createJobStarter>;
}) {
  async function startDigest({
    date,
    force = false,
    trigger = 'manual',
    scheduleKey,
  }: DigestInput = {}) {
    const digestDate =
      typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? date
        : new Date().toLocaleDateString('en-CA');
    const digestTrigger = trigger === 'schedule' ? 'schedule' : 'manual';
    const activeJob = [...jobs.values()].find(
      (job) =>
        job.resourceType === 'rssDigest' &&
        job.digestDate === digestDate &&
        (job.status === 'queued' || job.status === 'running'),
    );
    if (activeJob) return { job: publicJob(activeJob), skipped: false };

    const persistedState = await readPersistedState();
    if (!persistedState?.state) throw statusError(409, '服务端尚未初始化');
    const state = persistedState.state;
    const digestRunId = randomUUID();
    const attemptedAt = Date.now();
    const persistAttempt = async ({ status, message, model, itemCount = 0 }: DigestAttempt) => {
      const completed = status !== 'queued' && status !== 'running';
      await mutatePersistedState((nextPersistedState) => {
        nextPersistedState.state.rssDigestSettings = {
          ...(nextPersistedState.state.rssDigestSettings || {}),
          lastAttemptAt: attemptedAt,
          lastError: status === 'failed' ? message : undefined,
          ...(scheduleKey ? { lastScheduledKey: scheduleKey } : {}),
        };
        upsertDigestRun(nextPersistedState.state, {
          id: digestRunId!,
          date: digestDate!,
          trigger: digestTrigger,
          status,
          ...(scheduleKey ? { scheduleKey } : {}),
          ...(model ? { model } : {}),
          itemCount,
          startedAt: attemptedAt,
          updatedAt: attemptedAt,
          ...(completed ? { completedAt: attemptedAt } : {}),
          ...(message ? { message } : {}),
        });
      });
    };
    const settings = state.rssDigestSettings || {};
    const configuredProvider =
      typeof settings.provider === 'string' && settings.provider.startsWith('api:')
        ? settings.provider
        : null;
    const provider = configuredProvider || state.aiPreferences?.provider;
    const configId = typeof provider === 'string' ? provider.slice('api:'.length) : '';
    const configs = Array.isArray(state.openAIConfigs) ? state.openAIConfigs : [];
    const config =
      configs.find((item) => item.id === configId) ||
      (!configuredProvider ? configs[0] : undefined);
    const configuredModel =
      typeof settings.model === 'string' && settings.model.trim() ? settings.model : '';
    const model = configuredModel
      ? config?.models?.includes(configuredModel)
        ? configuredModel
        : undefined
      : config?.models?.includes(state.aiPreferences?.model as string)
        ? state.aiPreferences!.model
        : config?.models?.[0];
    if (!config || !model) {
      const message = '请先为 RSS 日报选择可用的模型';
      await persistAttempt({ status: 'failed', message, model: configuredModel });
      throw statusError(409, message);
    }

    const dayStart = new Date(`${digestDate}T00:00:00`).getTime();
    const dayEnd = new Date(`${digestDate}T23:59:59.999`).getTime();
    if (!Number.isFinite(dayStart) || !Number.isFinite(dayEnd))
      throw statusError(400, '日报日期不正确');
    const allItems = Array.isArray(state.rssItems) ? state.rssItems : [];
    const dayItems = allItems.filter(
      (item) => item.publishedAt >= dayStart && item.publishedAt <= dayEnd,
    );
    const previous = (Array.isArray(state.rssDailyDigests) ? state.rssDailyDigests : []).find(
      (digest) => digest.date === digestDate,
    );
    const previousIds = new Set(previous?.sourceItemIds || []);
    const newItems = dayItems.filter((item) => !previousIds.has(item.id));
    if (!force && previous && !newItems.length) {
      await persistAttempt({ status: 'skipped', message: '没有新的内容', model });
      return { skipped: true };
    }
    const includedIds = new Set([
      ...(previous?.sourceItemIds || []),
      ...dayItems.map((item) => item.id),
    ]);
    const digestItems = allItems
      .filter((item) => includedIds.has(item.id))
      .sort((left, right) => right.publishedAt - left.publishedAt);
    if (!digestItems.length) {
      const message = '这一天还没有可整理的内容';
      if (digestTrigger === 'schedule') {
        await persistAttempt({ status: 'skipped', message, model });
        return { skipped: true };
      }
      await persistAttempt({ status: 'failed', message, model });
      throw statusError(409, message);
    }

    await mutatePersistedState((nextPersistedState) => {
      nextPersistedState.state.rssDigestSettings = {
        ...(nextPersistedState.state.rssDigestSettings || {}),
        lastAttemptAt: attemptedAt,
        lastError: undefined,
        ...(scheduleKey ? { lastScheduledKey: scheduleKey } : {}),
      };
    });
    const configuredPrompt = optionalString(settings.prompt, 12_000).trim();
    const legacyDefaultPrompt =
      '请把当天尚未读过的 RSS 内容整理成一份中文日报。先按事件和主题去重，再按重要性组织；每条结论说明发生了什么、为什么值得关注，并用 Markdown 链接附上对应订阅源原文。不要重复陈述同一事件，不要编造来源或正文中没有的信息。';
    const prompt =
      configuredPrompt && configuredPrompt !== legacyDefaultPrompt
        ? configuredPrompt
        : '请把当天全部 RSS 内容整理成一份中文日报。先按事件和主题去重，再按重要性组织；每条结论说明发生了什么、为什么值得关注，并用 Markdown 链接附上对应订阅源原文。不要重复陈述同一事件，不要编造来源或正文中没有的信息。';
    const createdAt = Date.now();
    try {
      const job = await start({
        configId: config.id,
        model,
        bookId: `rss-digest:${digestDate}`,
        resourceType: 'rssDigest',
        purpose: 'digest',
        digestDate,
        digestItemIds: digestItems.map((item) => item.id),
        digestRunId,
        digestRunStartedAt: attemptedAt,
        digestTrigger,
        digestScheduleKey: scheduleKey,
        conversationId: `rss-digest:${digestDate}`,
        userMessage: {
          id: randomUUID(),
          content: [
            prompt,
            '',
            `日报日期：${digestDate}`,
            `本次触发方式：${digestTrigger === 'schedule' ? '定时任务' : '手动生成'}`,
            '先读取当天全部条目与上一版日报，再输出可直接阅读的完整日报。',
          ].join('\n'),
          createdAt,
        },
        session: { title: `${digestDate} RSS 日报`, createdAt },
        currentText: '',
      });
      return { job, skipped: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : '日报任务启动失败';
      await persistAttempt({ status: 'failed', message, model, itemCount: digestItems.length });
      throw error;
    }
  }
  return startDigest;
}
