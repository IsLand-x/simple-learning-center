import { Select, Tooltip } from '@douyinfe/semi-ui';
import { useId } from 'react';
import type { AiReasoningEffort, OpenAICompatibleConfig } from '../../../contracts/ai';
import { coerceAiReasoningEffort, getAiReasoningProfile } from '../../util/ai/aiReasoning';

export function AiReasoningEffortSelector({
  config,
  model,
  value,
  disabled,
  onChange,
}: {
  config?: OpenAICompatibleConfig;
  model: string;
  value: AiReasoningEffort;
  disabled: boolean;
  onChange: (effort: AiReasoningEffort) => void;
}) {
  const profile = getAiReasoningProfile(config, model);
  const effectiveValue = coerceAiReasoningEffort(value, config, model);
  const selectedLabel =
    profile.options.find((option) => option.value === effectiveValue)?.label ?? '自动';
  const labelId = useId();
  return (
    <Tooltip content={profile.description} position="top">
      <span className="ai-composer-reasoning-control min-w-0">
        <span className="visually-hidden" id={labelId}>
          选择 AI 强度
        </span>
        <Select
          aria-labelledby={labelId}
          className="ai-composer-reasoning-select"
          disabled={disabled || profile.kind === 'unsupported'}
          renderSelectedItem={() => `强度 · ${selectedLabel}`}
          showArrow={false}
          size="small"
          value={effectiveValue}
          onChange={(nextValue) => onChange(nextValue as AiReasoningEffort)}
        >
          {profile.options.map((option) => (
            <Select.Option key={option.value} value={option.value}>
              {option.label}
            </Select.Option>
          ))}
        </Select>
      </span>
    </Tooltip>
  );
}
