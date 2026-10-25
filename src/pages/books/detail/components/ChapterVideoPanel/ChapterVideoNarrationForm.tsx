import { Checkbox, Input, Select } from '@douyinfe/semi-ui';
import type { OpenAICompatibleConfig } from '../../../../../../contracts/ai';
import type { ChapterVideoNarration } from '../../../../../../contracts/reading';
import { narrationDefaults } from './model';

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
                ? { configId: available[0].id, ...narrationDefaults(available[0].baseUrl) }
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
              optionList={available.map((config) => ({
                key: config.id,
                value: config.id,
                label: <span>{config.name}</span>,
              }))}
              onChange={(configId) => {
                const config = available.find((entry) => entry.id === configId);
                if (config) onChange({ configId: config.id, ...narrationDefaults(config.baseUrl) });
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
              placeholder="厂商提供的 TTS 模型名称"
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
              placeholder="与语音模型匹配的音色 ID"
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
      <p className="text-[12px] leading-normal [color:var(--semi-color-text-2)]">
        中文配音可使用硅基流动 CosyVoice。
        <a
          href="https://cloud.siliconflow.cn/account/ak"
          target="_blank"
          rel="noreferrer"
          className="[color:var(--semi-color-primary)]"
        >
          申请 API Key
        </a>
        后在设置中添加供应商；选择该供应商会自动填入模型和音色。
      </p>
    </div>
  );
}
