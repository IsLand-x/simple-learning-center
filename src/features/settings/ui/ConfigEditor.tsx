import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button, Input, Tag, TextArea, Toast, Typography } from '@douyinfe/semi-ui';
import {
  IconAlertTriangle,
  IconDeleteStroked,
  IconEditStroked,
  IconKeyStroked,
} from '@douyinfe/semi-icons';
import { confirmDialog } from '../../../lib/confirmDialog';
import { useLearningStore } from '../../../store/useLearningStore';
import type { OpenAICompatibleConfig } from '../../../types';
import { splitModels } from '../model/modelConfig';

const { Text } = Typography;

export interface ConfigEditorProps {
  config: OpenAICompatibleConfig;
  editing: boolean;
  onEdit: () => void;
  onClose: () => void;
}

export function ConfigEditor({ config, editing, onEdit, onClose }: ConfigEditorProps) {
  const updateConfig = useLearningStore((state) => state.updateOpenAIConfig);
  const deleteConfig = useLearningStore((state) => state.deleteOpenAIConfig);
  const [name, setName] = useState(config.name);
  const [baseUrl, setBaseUrl] = useState(config.baseUrl);
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [models, setModels] = useState(config.models.join('\n'));

  const resetDraft = useCallback(() => {
    setName(config.name);
    setBaseUrl(config.baseUrl);
    setApiKey(config.apiKey);
    setModels(config.models.join('\n'));
  }, [config]);

  useEffect(() => {
    resetDraft();
  }, [resetDraft]);

  const save = (event: FormEvent) => {
    event.preventDefault();
    const nextModels = splitModels(models);
    if (!name.trim() || !baseUrl.trim() || !nextModels.length) {
      Toast.warning('请填写名称、API 地址和至少一个模型');
      return;
    }
    try {
      new URL(baseUrl.trim());
    } catch {
      Toast.error('API 地址格式不正确');
      return;
    }
    updateConfig(config.id, {
      name: name.trim(),
      baseUrl: baseUrl.trim().replace(/\/+$/, ''),
      apiKey: apiKey.trim(),
      models: nextModels,
    });
    Toast.success('模型配置已保存');
    onClose();
  };

  const confirmDelete = () => {
    confirmDialog({
      title: `删除“${config.name}”？`,
      content: '只会删除保存在服务器数据目录中的模型配置。',
      icon: <IconAlertTriangle size="large" style={{ color: 'var(--semi-color-warning)' }} />,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { type: 'danger' },
      onOk: () => deleteConfig(config.id),
    });
  };

  if (!editing) {
    return (
      <article className="api-config-summary">
        <div className="api-config-summary__identity">
          <IconKeyStroked size="large" />
          <div>
            <Text strong>{config.name}</Text>
            <Text size="small" type="tertiary" ellipsis={{ showTooltip: true }}>
              {config.baseUrl}
            </Text>
          </div>
        </div>
        <div className="api-config-summary__models" aria-label={`${config.name} 支持的模型`}>
          {config.models.map((model) => (
            <Tag key={model} size="small" color="grey">
              {model}
            </Tag>
          ))}
        </div>
        <div className="api-config-summary__meta">
          <Tag size="small" color={config.apiKey ? 'green' : 'amber'}>
            {config.apiKey ? 'Key 已配置' : 'Key 未配置'}
          </Tag>
          <Text size="small" type="tertiary">
            {config.models.length} 个模型
          </Text>
        </div>
        <div className="api-config-summary__actions">
          <Button
            aria-label={`编辑 ${config.name}`}
            icon={<IconEditStroked />}
            size="small"
            theme="borderless"
            type="tertiary"
            onClick={onEdit}
          />
          <Button
            aria-label={`删除 ${config.name}`}
            icon={<IconDeleteStroked />}
            size="small"
            theme="borderless"
            type="danger"
            onClick={confirmDelete}
          />
        </div>
      </article>
    );
  }

  return (
    <form className="api-config-card api-config-card--editing" onSubmit={save}>
      <div className="api-config-card__heading">
        <div className="api-config-card__identity">
          <IconKeyStroked size="large" />
          <Text strong>{name.trim() || config.name}</Text>
        </div>
        <Text size="small" type="tertiary">
          编辑模型配置
        </Text>
      </div>

      <label className="settings-field">
        <Text size="small" strong>
          模型配置名称
        </Text>
        <Input value={name} onChange={setName} placeholder="例如：OpenAI / 本地 Ollama" />
      </label>
      <label className="settings-field">
        <Text size="small" strong>
          OpenAI 兼容 API 地址
        </Text>
        <Input value={baseUrl} onChange={setBaseUrl} placeholder="https://api.openai.com/v1" />
        <Text size="small" type="tertiary">
          填写到版本路径即可，应用会请求 /chat/completions。
        </Text>
      </label>
      <label className="settings-field">
        <Text size="small" strong>
          API Key
        </Text>
        <Input
          type="password"
          value={apiKey}
          onChange={setApiKey}
          placeholder="sk-…"
          autoComplete="off"
        />
      </label>
      <label className="settings-field">
        <Text size="small" strong>
          可选模型
        </Text>
        <TextArea
          value={models}
          onChange={setModels}
          autosize={{ minRows: 3, maxRows: 8 }}
          placeholder={'gpt-4.1-mini\ngpt-4.1'}
        />
        <Text size="small" type="tertiary">
          每行一个，也可以用逗号分隔。
        </Text>
      </label>
      <div className="api-config-card__footer">
        <Button
          theme="borderless"
          type="tertiary"
          onClick={() => {
            resetDraft();
            onClose();
          }}
        >
          取消
        </Button>
        <Button htmlType="submit" theme="solid" type="primary">
          保存配置
        </Button>
      </div>
    </form>
  );
}
