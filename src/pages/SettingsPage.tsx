import { useEffect, useState, type FormEvent } from 'react';
import { Button, Empty, Input, Modal, Tag, TextArea, Toast, Typography } from '@douyinfe/semi-ui';
import { IconAlertTriangle, IconDeleteStroked, IconEditStroked, IconKeyStroked, IconPlus } from '@douyinfe/semi-icons';
import { useLearningStore } from '../store/useLearningStore';
import type { OpenAICompatibleConfig } from '../types';

const { Title, Text } = Typography;

function splitModels(value: string) {
  return Array.from(new Set(value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean)));
}

function ConfigEditor({
  config,
  editing,
  onEdit,
  onClose,
}: {
  config: OpenAICompatibleConfig;
  editing: boolean;
  onEdit: () => void;
  onClose: () => void;
}) {
  const updateConfig = useLearningStore((state) => state.updateOpenAIConfig);
  const deleteConfig = useLearningStore((state) => state.deleteOpenAIConfig);
  const [name, setName] = useState(config.name);
  const [baseUrl, setBaseUrl] = useState(config.baseUrl);
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [models, setModels] = useState(config.models.join('\n'));

  const resetDraft = () => {
    setName(config.name);
    setBaseUrl(config.baseUrl);
    setApiKey(config.apiKey);
    setModels(config.models.join('\n'));
  };

  useEffect(() => {
    resetDraft();
  }, [config]);

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
    Modal.confirm({
      title: `删除“${config.name}”？`,
      content: '只会删除保存在此设备上的模型配置。',
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
            <Text size="small" type="tertiary" ellipsis={{ showTooltip: true }}>{config.baseUrl}</Text>
          </div>
        </div>
        <div className="api-config-summary__models" aria-label={`${config.name} 支持的模型`}>
          {config.models.map((model) => <Tag key={model} size="small" color="grey">{model}</Tag>)}
        </div>
        <div className="api-config-summary__meta">
          <Tag size="small" color={config.apiKey ? 'green' : 'amber'}>{config.apiKey ? 'Key 已配置' : 'Key 未配置'}</Tag>
          <Text size="small" type="tertiary">{config.models.length} 个模型</Text>
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
        <Text size="small" type="tertiary">编辑模型配置</Text>
      </div>

      <label className="settings-field">
        <Text size="small" strong>模型配置名称</Text>
        <Input value={name} onChange={setName} placeholder="例如：OpenAI / 本地 Ollama" />
      </label>
      <label className="settings-field">
        <Text size="small" strong>OpenAI 兼容 API 地址</Text>
        <Input value={baseUrl} onChange={setBaseUrl} placeholder="https://api.openai.com/v1" />
        <Text size="small" type="tertiary">填写到版本路径即可，应用会请求 /chat/completions。</Text>
      </label>
      <label className="settings-field">
        <Text size="small" strong>API Key</Text>
        <Input type="password" value={apiKey} onChange={setApiKey} placeholder="sk-…" autoComplete="off" />
      </label>
      <label className="settings-field">
        <Text size="small" strong>可选模型</Text>
        <TextArea
          value={models}
          onChange={setModels}
          autosize={{ minRows: 3, maxRows: 8 }}
          placeholder={'gpt-4.1-mini\ngpt-4.1'}
        />
        <Text size="small" type="tertiary">每行一个，也可以用逗号分隔。</Text>
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
        <Button htmlType="submit" theme="solid" type="primary">保存配置</Button>
      </div>
    </form>
  );
}

export function SettingsPage() {
  const configs = useLearningStore((state) => state.openAIConfigs);
  const addConfig = useLearningStore((state) => state.addOpenAIConfig);
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null);

  const add = () => {
    const timestamp = Date.now();
    const id = crypto.randomUUID();
    addConfig({
      id,
      name: `模型 ${configs.length + 1}`,
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      models: ['gpt-4.1-mini'],
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    setEditingConfigId(id);
  };

  return (
    <main className="settings-page">
      <header className="settings-header">
        <div>
          <Title heading={4}>设置</Title>
          <Text type="tertiary">管理 AI 模型</Text>
        </div>
        <Button icon={<IconPlus />} theme="solid" type="primary" onClick={add}>添加模型</Button>
      </header>

      <section className="settings-notice" aria-label="API Key 存储说明">
        <Text strong>仅保存在此设备</Text>
        <Text size="small" type="tertiary">
          API Key 会写入当前浏览器的本地存储，并由浏览器直接请求你配置的地址。该地址需要允许浏览器跨域访问；请勿在公共设备上保存密钥。
        </Text>
      </section>

      <section className="api-config-list" aria-label="AI 模型配置列表">
        {configs.length
          ? configs.map((config) => (
            <ConfigEditor
              key={config.id}
              config={config}
              editing={editingConfigId === config.id}
              onEdit={() => setEditingConfigId(config.id)}
              onClose={() => setEditingConfigId(null)}
            />
          ))
          : <Empty title="还没有 AI 模型" description="添加一个 OpenAI 兼容模型后，就能在阅读器侧栏开始对话" />}
      </section>
    </main>
  );
}
