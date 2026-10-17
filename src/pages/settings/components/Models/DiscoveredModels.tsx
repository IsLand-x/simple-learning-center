import { Button, Select, Typography } from '@douyinfe/semi-ui';

const { Text } = Typography;

export function DiscoveredModels({
  models,
  selected,
  onChange,
  labelId,
}: {
  labelId: string;
  models: string[];
  selected: string[];
  onChange: (models: string[]) => void;
}) {
  const options = [...new Set([...models, ...selected])];
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Select<string>
        aria-labelledby={labelId}
        className="w-full min-w-0"
        multiple
        filter
        allowCreate
        maxTagCount={2}
        value={selected}
        optionList={options.map((model) => ({ label: model, value: model }))}
        virtualize={options.length > 100 ? { itemSize: 36, height: 252 } : undefined}
        onChange={(value) => onChange(Array.isArray(value) ? value : [])}
        placeholder="搜索或输入模型 ID 后回车"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Text type="tertiary" size="small" role="status">
          检测到 {models.length} 个模型，已选 {selected.length} 个
        </Text>
        <Button theme="borderless" type="tertiary" onClick={() => onChange(options)}>
          全部加入
        </Button>
        <Button theme="borderless" type="tertiary" onClick={() => onChange([])}>
          清空选择
        </Button>
      </div>
      <Text type="tertiary" size="small">
        同一地址的模型作为一个供应商加入助手。列表由供应商返回，聊天与工具能力以实际调用为准。
      </Text>
    </div>
  );
}
