import { useMemo } from 'react';
import { Cascader } from '@douyinfe/semi-ui';
import type { AiProvider, OpenAICompatibleConfig } from '../../../contracts/ai';

export function AiModelSelector({
  configs,
  provider,
  model,
  disabled,
  className,
  onChange,
}: {
  configs: OpenAICompatibleConfig[];
  provider: AiProvider | null;
  model: string;
  disabled: boolean;
  className?: string;
  onChange: (selection: unknown) => void;
}) {
  const treeData = useMemo(
    () =>
      configs.map((config) => ({
        label: config.name,
        value: `api:${config.id}`,
        children: config.models.map((item) => ({ label: item, value: item })),
      })),
    [configs],
  );
  // Semi compares the controlled value by reference and resets its active path.
  const value = useMemo(() => (provider && model ? [provider, model] : []), [provider, model]);
  return (
    <Cascader
      aria-label="选择 AI 供应商和模型"
      size="small"
      treeData={treeData}
      value={value}
      placeholder="选择供应商 / 模型"
      disabled={disabled}
      showNext="hover"
      changeOnSelect={false}
      displayRender={(labels) => (Array.isArray(labels) ? (labels.at(-1) ?? '') : '')}
      onChange={onChange}
      className={`ai-composer-model-cascader [width:fit-content] [max-width:100%] min-w-0 ${className ? ` ${className}` : ''}`}
    />
  );
}
