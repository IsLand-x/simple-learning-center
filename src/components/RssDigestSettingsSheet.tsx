import { useEffect, useMemo, useState } from 'react';
import { Button, Select, SideSheet, Switch, Tag, TextArea, Typography } from '@douyinfe/semi-ui';
import type { AiProvider, OpenAICompatibleConfig, RssDigestRun, RssDigestRunStatus, RssDigestSettings } from '../types';
import { AiModelSelector } from './AiConversationPrimitives';

const { Text, Title } = Typography;

const scheduleOptions = [
  { label: '每 2 小时', value: 'every-2-hours' },
  { label: '每 4 小时', value: 'every-4-hours' },
  { label: '每天指定时间', value: 'fixed-times' },
];

const runStatusMeta: Record<RssDigestRunStatus, {
  color: 'blue' | 'green' | 'red' | 'grey';
  label: string;
}> = {
  queued: { color: 'blue', label: '等待中' },
  running: { color: 'blue', label: '执行中' },
  completed: { color: 'green', label: '已完成' },
  failed: { color: 'red', label: '失败' },
  skipped: { color: 'grey', label: '已跳过' },
  cancelled: { color: 'grey', label: '已取消' },
};

function digestDateLabel(date: string) {
  const [, month, day] = date.split('-').map(Number);
  return month && day ? `${month}月${day}日` : date;
}

function runTimeLabel(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(timestamp);
}

export function RssDigestSettingsSheet({
  configs,
  runs,
  settings,
  visible,
  onCancel,
  onSave,
}: {
  configs: OpenAICompatibleConfig[];
  runs: RssDigestRun[];
  settings: RssDigestSettings;
  visible: boolean;
  onCancel: () => void;
  onSave: (settings: RssDigestSettings) => void;
}) {
  const [draft, setDraft] = useState(settings);
  const timeOptions = useMemo(() => Array.from({ length: 24 }, (_, hour) => {
    const value = `${String(hour).padStart(2, '0')}:00`;
    return { label: value, value };
  }), []);
  const visibleRuns = useMemo(
    () => [...runs].sort((left, right) => right.startedAt - left.startedAt).slice(0, 100),
    [runs],
  );

  useEffect(() => {
    if (visible) setDraft(settings);
  }, [settings, visible]);

  const selectedConfig = draft.provider
    ? configs.find((config) => draft.provider === `api:${config.id}`)
    : undefined;
  const canSave = Boolean(
    draft.prompt.trim()
    && (!draft.enabled || (selectedConfig && selectedConfig.models.includes(draft.model)))
    && (draft.scheduleMode !== 'fixed-times' || draft.times.length),
  );

  return (
    <SideSheet
      bodyStyle={{ padding: 0 }}
      className="rss-digest-settings-sheet"
      closable={false}
      maskClosable
      placement="right"
      title="日报设置"
      visible={visible}
      width="min(460px, 92vw)"
      onCancel={onCancel}
    >
      <div className="rss-digest-settings">
        <section className="rss-digest-settings__section">
          <div className="rss-digest-settings__switch-row">
            <div className="rss-digest-settings__switch-copy">
              <Title heading={5}>自动生成今天的日报</Title>
              <Text size="small" type="tertiary">服务运行时会在后台整理当天未读内容，浏览器可以关闭。</Text>
            </div>
            <Switch
              aria-label="自动生成 RSS 日报"
              checked={draft.enabled}
              onChange={(enabled) => setDraft((current) => ({ ...current, enabled }))}
            />
          </div>
        </section>

        <section className="rss-digest-settings__section">
          <label className="rss-digest-settings__field">
            <Text strong>模型</Text>
            <AiModelSelector
              className="rss-digest-settings__model-select"
              configs={configs}
              disabled={!configs.length}
              model={draft.model}
              provider={draft.provider}
              onChange={(selection) => {
                if (!Array.isArray(selection)) return;
                const [provider, model] = selection;
                if (typeof provider !== 'string' || !provider.startsWith('api:') || typeof model !== 'string') return;
                setDraft((current) => ({ ...current, provider: provider as AiProvider, model }));
              }}
            />
          </label>
          {!configs.length && <Text size="small" type="warning">请先在设置页添加模型配置。</Text>}
        </section>

        <section className="rss-digest-settings__section">
          <label className="rss-digest-settings__field">
            <Text strong>执行计划</Text>
            <Select
              aria-label="选择日报执行计划"
              optionList={scheduleOptions}
              value={draft.scheduleMode}
              onChange={(value) => setDraft((current) => ({
                ...current,
                scheduleMode: value as RssDigestSettings['scheduleMode'],
              }))}
            />
          </label>
          {draft.scheduleMode === 'fixed-times' && (
            <label className="rss-digest-settings__field">
              <Text strong>执行时间</Text>
              <Select
                aria-label="选择每天执行时间"
                multiple
                optionList={timeOptions}
                placeholder="至少选择一个时间"
                value={draft.times}
                onChange={(value) => setDraft((current) => ({
                  ...current,
                  times: Array.isArray(value) ? value.map(String).sort() : [],
                }))}
              />
            </label>
          )}
        </section>

        <section className="rss-digest-settings__section">
          <label className="rss-digest-settings__field">
            <Text strong>自定义 Prompt</Text>
            <TextArea
              aria-label="RSS 日报自定义 Prompt"
              autosize={{ minRows: 7, maxRows: 14 }}
              maxCount={12_000}
              value={draft.prompt}
              onChange={(prompt) => setDraft((current) => ({ ...current, prompt }))}
            />
          </label>
          <Text size="small" type="tertiary">系统会额外要求模型读取全部条目、合并上一版日报、保留来源链接并对重复事件去重。</Text>
        </section>

        {draft.lastError && (
          <section className="rss-digest-settings__section rss-digest-settings__error">
            <Text strong type="danger">上次自动生成失败</Text>
            <Text size="small" type="danger">{draft.lastError}</Text>
          </section>
        )}

        <section className="rss-digest-settings__section rss-digest-settings__history" aria-label="日报执行记录">
          <div className="rss-digest-settings__history-heading">
            <Text strong>执行记录</Text>
            <Text size="small" type="tertiary">最近 {Math.min(runs.length, 100)} 条</Text>
          </div>
          {visibleRuns.length ? (
            <div className="rss-digest-runs" role="list">
              {visibleRuns.map((run) => {
                const meta = runStatusMeta[run.status];
                return (
                  <article className="rss-digest-run" key={run.id} role="listitem">
                    <div className="rss-digest-run__topline">
                      <Tag color={meta.color} size="small" type="light">{meta.label}</Tag>
                      <time dateTime={new Date(run.startedAt).toISOString()}>{runTimeLabel(run.startedAt)}</time>
                    </div>
                    <Text strong>{digestDateLabel(run.date)}日报 · {run.trigger === 'schedule' ? '定时任务' : '手动生成'}</Text>
                    <Text size="small" type="tertiary">
                      {run.itemCount ? `${run.itemCount} 条内容` : '未处理内容'}
                      {run.model ? ` · ${run.model}` : ''}
                    </Text>
                    {run.message && <Text className="rss-digest-run__message" size="small" type={run.status === 'failed' ? 'danger' : 'tertiary'}>{run.message}</Text>}
                  </article>
                );
              })}
            </div>
          ) : <Text size="small" type="tertiary">还没有日报执行记录。手动生成或定时任务运行后会显示在这里。</Text>}
        </section>
      </div>
      <div className="rss-digest-settings__footer">
        <Button theme="borderless" type="tertiary" onClick={onCancel}>取消</Button>
        <Button disabled={!canSave} theme="solid" type="primary" onClick={() => onSave({ ...draft, prompt: draft.prompt.trim() })}>保存设置</Button>
      </div>
    </SideSheet>
  );
}
