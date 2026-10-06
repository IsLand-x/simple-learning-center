import { Toast } from '@douyinfe/semi-ui';
import { useEffect, useRef, useState } from 'react';
import type { HighlightItem } from '../../../../../../contracts/reading';
import { aiApi } from '../../../../../api/ai';
import type { AiJob } from '../../../../../api/ai/type';
import {
  refreshServerState,
  waitForServerStateWrites,
} from '../../../../../store/serverStateStorage';
import { useLearningStore } from '../../../../../store/useLearningStore';
import { createUuid } from '../../../../../util/uuid';
import { coerceAiReasoningEffort } from '../../../../../util/ai/aiReasoning';

export function useGlossaryExplanation(bookId: string, getCurrentText: () => string) {
  const [jobs, setJobs] = useState<AiJob[]>([]);
  const [pending, setPending] = useState<string[]>([]);
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [revision, setRevision] = useState(0);
  const starting = useRef(new Set<string>());
  const completed = useRef(new Set<string>());
  const configs = useLearningStore((state) => state.openAIConfigs);
  const preferences = useLearningStore((state) => state.aiPreferences);
  const config = configs.find((item) => preferences.provider === `api:${item.id}`);
  const model = config?.models.includes(preferences.model) ? preferences.model : config?.models[0];

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polling = false;
    const poll = async () => {
      if (polling || disposed) return;
      polling = true;
      if (timer) clearTimeout(timer);
      let repeat = false;
      try {
        const incoming = (await aiApi.listJobs({ bookId })).filter(
          (job) => job.purpose === 'glossary',
        );
        if (disposed) return;
        setJobs(incoming);
        repeat =
          incoming.some((job) => job.status === 'queued' || job.status === 'running') ||
          starting.current.size > 0;
        const fresh = incoming.filter(
          (job) => job.status === 'completed' && !completed.current.has(job.id),
        );
        if (fresh.length) {
          await refreshServerState(['highlights', 'conversations']);
          if (disposed) return;
          await useLearningStore.persist.rehydrate();
          fresh.forEach((job) => completed.current.add(job.id));
        }
      } catch {
        repeat = true;
      } finally {
        polling = false;
        if (!disposed && repeat) timer = setTimeout(() => void poll(), 2000);
      }
    };
    void poll();
    const onFocus = () => void poll();
    window.addEventListener('focus', onFocus);
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [bookId, revision]);

  const generate = async (term: HighlightItem) => {
    const latest = jobs.find((job) => job.termId === term.id);
    if (
      starting.current.has(term.id) ||
      latest?.status === 'queued' ||
      latest?.status === 'running' ||
      !config ||
      !model
    )
      return;
    starting.current.add(term.id);
    setPending([...starting.current]);
    setErrors((current) => {
      const next = new Map(current);
      next.delete(term.id);
      return next;
    });
    try {
      await waitForServerStateWrites();
      const timestamp = Date.now();
      const reasoning = coerceAiReasoningEffort(preferences.reasoningEffort, config, model);
      const job = await aiApi.startJob({
        configId: config.id,
        model,
        reasoningEffort: reasoning === 'auto' ? undefined : reasoning,
        bookId,
        purpose: 'glossary',
        termId: term.id,
        conversationId: `glossary:${term.id}`,
        userMessage: {
          id: createUuid(),
          createdAt: timestamp,
          content:
            '请结合本书语境解释引用术语的含义，必要时读取出处。用简体中文写 1—3 句简洁释义，只输出释义正文，不要标题或寒暄。',
          quote: { text: term.text, chapter: term.chapter },
        },
        session: { title: `术语释义：${term.text}`.slice(0, 100), createdAt: timestamp },
        currentText: getCurrentText(),
      });
      setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)]);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '无法生成释义';
      setErrors((current) => new Map(current).set(term.id, message));
      Toast.error(message);
    } finally {
      starting.current.delete(term.id);
      setPending([...starting.current]);
      setRevision((current) => current + 1);
    }
  };
  const status = (termId: string) => {
    const job = jobs.find((item) => item.termId === termId);
    return {
      busy: pending.includes(termId) || job?.status === 'queued' || job?.status === 'running',
      error:
        errors.get(termId) || (job?.status === 'failed' ? job.error || '释义生成失败，请重试' : ''),
    };
  };
  return { configured: Boolean(config && model), generate, status };
}
