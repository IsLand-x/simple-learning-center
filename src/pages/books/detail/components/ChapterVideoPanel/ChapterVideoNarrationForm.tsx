import { Checkbox, Input, Select } from '@douyinfe/semi-ui';
import type { OpenAICompatibleConfig } from '../../../../../../contracts/ai';
import type { ChapterVideoNarration } from '../../../../../../contracts/reading';

export function ChapterVideoNarrationForm({
  configs,
  value,
  disabled,
  onChange,
}: {
  configs: OpenAICompatibleConfig[];
  value: ChapterVideoNarration | undefined;
  disabled: boolean;
  onChange: (value: ChapterVideoNarration | undefined) => void;
}) {
  const available = configs.filter((config) => !config.oauthProvider && config.apiKey.trim());
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="chapter-video-actions flex min-h-[44px] items-center">
        <Checkbox
          checked={Boolean(value)}
          disabled={disabled || !available.length}
          onChange={(event) =>
            onChange(
              event.target.checked
                ? { configId: available[0].id, model: 'tts-1', voice: 'alloy' }
                : undefined,
            )
          }
        >
          生成中文配音
        </Checkbox>
      </div>
      {value ? (
        <div className="grid min-w-0 grid-cols-2 gap-3">
          <label className="col-span-2 flex min-w-0 flex-col gap-2 text-[12px] [color:var(--semi-color-text-1)]">
            配音供应商
            <Select
              aria-label="选择配音供应商"
              className="chapter-video-select w-full"
              value={value.configId}
              disabled={disabled}
              optionList={available.map((config) => ({ value: config.id, label: config.name }))}
              onChange={(configId) => {
                if (typeof configId === 'string') onChange({ ...value, configId });
              }}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-2 text-[12px] [color:var(--semi-color-text-1)]">
            语音模型
            <Input
              aria-label="语音模型"
              value={value.model}
              disabled={disabled}
              maxLength={200}
              placeholder="tts-1"
              onChange={(model) => onChange({ ...value, model })}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-2 text-[12px] [color:var(--semi-color-text-1)]">
            音色
            <Input
              aria-label="配音音色"
              value={value.voice}
              disabled={disabled}
              maxLength={100}
              placeholder="alloy"
              onChange={(voice) => onChange({ ...value, voice })}
            />
          </label>
          <p className="col-span-2 text-[12px] leading-normal [color:var(--semi-color-text-2)]">
            讲稿会发送给所选配音供应商；需要支持语音接口的模型。配音为 AI 合成。
          </p>
        </div>
      ) : (
        <p className="text-[12px] leading-normal [color:var(--semi-color-text-2)]">
          当前生成字幕版视频。{!available.length && '配音需先在设置中添加支持语音的 API 供应商。'}
        </p>
      )}
    </div>
  );
}
