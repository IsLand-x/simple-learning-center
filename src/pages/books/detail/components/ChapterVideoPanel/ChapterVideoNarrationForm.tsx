import { Checkbox } from '@douyinfe/semi-ui';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ChapterVideoNarration } from '../../../../../../contracts/reading';
import type { TtsStatus } from '../../../../../../contracts/ai';
import { settingsApi } from '../../../../../api/settings';

export function ChapterVideoNarrationForm({
  value,
  disabled,
  onChange,
  onReady,
}: {
  value: ChapterVideoNarration | undefined;
  disabled: boolean;
  onChange: (value: ChapterVideoNarration | undefined) => void;
  onReady: (ready: boolean) => void;
}) {
  const [status, setStatus] = useState<TtsStatus>();
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void settingsApi
      .getTts(controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        setStatus(next);
        onChange(next.configured ? { source: 'settings' } : undefined);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('读取语音配置失败，请重新打开面板');
      })
      .finally(() => {
        if (!controller.signal.aborted) onReady(true);
      });
    return () => controller.abort();
  }, [onChange, onReady]);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="chapter-video-actions flex min-h-[44px] items-center">
        <Checkbox
          checked={Boolean(value)}
          disabled={disabled || !status?.configured}
          onChange={(event) => onChange(event.target.checked ? { source: 'settings' } : undefined)}
        >
          生成中文配音
        </Checkbox>
      </div>
      <p className="text-[12px] leading-normal [color:var(--semi-color-text-2)]">
        {error ||
          (value
            ? `使用阿里云百炼 ${status?.model ?? ''}，讲稿仅发送给所选语音服务。配音为 AI 合成。`
            : '当前生成字幕版视频。')}{' '}
        <Link to="/settings?tab=tts">
          {status?.configured ? '管理 TTS 配置' : '在设置的 TTS 标签中配置中文配音'}
        </Link>
      </p>
    </div>
  );
}
