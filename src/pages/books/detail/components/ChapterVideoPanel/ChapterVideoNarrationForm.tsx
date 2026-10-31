import { Checkbox } from '@douyinfe/semi-ui';
import { Link } from 'react-router-dom';
import type { ChapterVideoNarration } from '../../../../../../contracts/reading';
import type { TtsStatus } from '../../../../../../contracts/ai';

export function ChapterVideoNarrationForm({
  value,
  status,
  error,
  disabled,
  onChange,
}: {
  value: ChapterVideoNarration | undefined;
  status?: TtsStatus;
  error?: string;
  disabled: boolean;
  onChange: (value: ChapterVideoNarration | undefined) => void;
}) {
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
