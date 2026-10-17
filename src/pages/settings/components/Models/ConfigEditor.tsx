import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button, Input, Tag, TextArea, Toast, Typography } from '@douyinfe/semi-ui';
import {
  IconAlertTriangle,
  IconDeleteStroked,
  IconEditStroked,
  IconKeyStroked,
  IconSearchStroked,
} from '@douyinfe/semi-icons';
import { confirmDialog } from '../../../../util/confirmDialog';
import { useLearningStore } from '../../../../store/useLearningStore';
import type { OpenAICompatibleConfig } from '../../../../../contracts/ai';
import { splitModels } from './modelConfig';
import { DiscoveredModels } from './DiscoveredModels';
import { useModelDiscovery } from './useModelDiscovery';

const { Text } = Typography;

export interface ConfigEditorProps {
  config: OpenAICompatibleConfig;
  isNew?: boolean;
  editing: boolean;
  onEdit: () => void;
  onClose: () => void;
}

export function ConfigEditor({
  config,
  isNew = false,
  editing,
  onEdit,
  onClose,
}: ConfigEditorProps) {
  const addConfig = useLearningStore((state) => state.addOpenAIConfig);
  const updateConfig = useLearningStore((state) => state.updateOpenAIConfig);
  const deleteConfig = useLearningStore((state) => state.deleteOpenAIConfig);
  const [name, setName] = useState(config.name);
  const [baseUrl, setBaseUrl] = useState(config.baseUrl);
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [models, setModels] = useState(config.models.join('\n'));
  const discovery = useModelDiscovery(baseUrl, apiKey, editing);

  const detect = async () => {
    const result = await discovery.discover();
    if (result)
      setModels((current) => [...new Set([...splitModels(current), ...result.models])].join('\n'));
  };

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
    if (discovery.busy) return;
    if (!baseUrl.trim() || !nextModels.length) {
      Toast.warning('请填写 API 地址，并检测或手动填写至少一个模型');
      return;
    }
    let url: URL;
    try {
      url = new URL(baseUrl.trim());
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        throw new Error();
    } catch {
      Toast.error('请填写有效的 HTTP 或 HTTPS API 地址，不要包含账号、查询参数或片段');
      return;
    }
    const changes = {
      name: name.trim() || url.hostname,
      baseUrl:
        discovery.result?.baseUrl ??
        baseUrl
          .trim()
          .replace(/\/+$/, '')
          .replace(/\/(?:chat\/completions|models)$/, ''),
      apiKey: apiKey.trim(),
      models: nextModels,
    };
    if (isNew) addConfig({ ...config, ...changes, createdAt: Date.now(), updatedAt: Date.now() });
    else updateConfig(config.id, changes);
    Toast.success(isNew ? '供应商及模型已添加到助手' : '模型配置已保存');
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
      <article className="api-config-summary [min-height:64px] [gap:16px] [padding:10px_12px] [background:var(--semi-color-bg-1)] [@media(max-width:860px)]:flex-wrap [@media(max-width:720px)]:[gap:10px] mobile:[padding:10px]">
        <div className="api-config-summary__identity [width:220px] min-w-0 [color:var(--semi-color-text-1)]">
          <IconKeyStroked size="large" />
          <div>
            <Text strong>{config.name}</Text>
            <Text size="small" type="tertiary" ellipsis={{ showTooltip: true }}>
              {config.baseUrl}
            </Text>
          </div>
        </div>
        <div
          className="api-config-summary__models min-w-0 [gap:4px] [@media(max-width:860px)]:[order:3]"
          aria-label={`${config.name} 支持的模型`}
        >
          {config.models.slice(0, 6).map((model) => (
            <Tag key={model} size="small" color="grey" className="max-w-full">
              <span className="block max-w-full truncate">{model}</span>
            </Tag>
          ))}
          {config.models.length > 6 && (
            <Tag size="small" color="grey">
              另 {config.models.length - 6} 个
            </Tag>
          )}
        </div>
        <div className="api-config-summary__meta whitespace-nowrap [@media(max-width:720px)]:[order:4]">
          <Tag size="small" color={config.apiKey ? 'green' : 'amber'}>
            {config.apiKey ? 'Key 已配置' : 'Key 未配置'}
          </Tag>
          <Text size="small" type="tertiary">
            {config.models.length} 个模型
          </Text>
        </div>
        <div className="api-config-summary__actions [gap:2px]">
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
    <form
      className="api-config-card [grid-template-columns:repeat(2,_minmax(0,_1fr))] [padding:18px] [background:var(--semi-color-bg-1)] [@media(max-width:860px)]:[grid-template-columns:1fr] mobile:[padding:14px] api-config-card--editing min-w-0"
      onSubmit={save}
    >
      <div className="api-config-card__heading [grid-column:1_/_-1] justify-between">
        <div className="api-config-card__identity [color:var(--semi-color-text-1)]">
          <IconKeyStroked size="large" />
          <Text strong>{name.trim() || config.name || '新供应商'}</Text>
        </div>
        <Text size="small" type="tertiary">
          {isNew ? '添加供应商' : '编辑模型配置'}
        </Text>
      </div>

      <label className="settings-field min-w-0 [gap:6px] [@media(max-width:860px)]:[grid-column:1_/_-1]">
        <Text size="small" strong>
          模型配置名称
        </Text>
        <Input value={name} onChange={setName} placeholder="可选，默认使用地址域名" />
      </label>
      <label className="settings-field min-w-0 [gap:6px] [@media(max-width:860px)]:[grid-column:1_/_-1]">
        <Text size="small" strong>
          OpenAI 兼容 API 地址
        </Text>
        <Input value={baseUrl} onChange={setBaseUrl} placeholder="https://api.openai.com/v1" />
        <Text size="small" type="tertiary">
          支持供应商根地址或版本路径；检测会请求 /models，对话使用 /chat/completions。
        </Text>
      </label>
      <label className="settings-field min-w-0 [gap:6px] [@media(max-width:860px)]:[grid-column:1_/_-1]">
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
      <div className="settings-field min-w-0 [gap:6px] [grid-column:1_/_-1]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Text size="small" strong id={`models-label-${config.id}`}>
            可选模型
          </Text>
          <Button
            icon={<IconSearchStroked />}
            loading={discovery.busy}
            disabled={!baseUrl.trim() || discovery.busy}
            onClick={() => void detect()}
          >
            检测模型
          </Button>
        </div>
        {discovery.error && (
          <Text type="danger" role="alert">
            {discovery.error}
          </Text>
        )}
        {discovery.busy && (
          <Text type="tertiary" role="status">
            正在从供应商获取模型列表…
          </Text>
        )}
        {discovery.result ? (
          <DiscoveredModels
            labelId={`models-label-${config.id}`}
            models={discovery.result.models}
            selected={splitModels(models)}
            onChange={(selected) => setModels(selected.join('\n'))}
          />
        ) : (
          <TextArea
            aria-labelledby={`models-label-${config.id}`}
            value={models}
            onChange={setModels}
            disabled={discovery.busy}
            autosize={{ minRows: 3, maxRows: 8 }}
            placeholder={'检测后自动填入，也可以手动填写模型 ID，每行一个或用逗号分隔'}
          />
        )}
        <Text size="small" type="tertiary">
          检测只向此地址发送 API Key，不发送对话或书籍内容；不支持检测时可手动填写。
        </Text>
      </div>
      <div className="api-config-card__footer [grid-column:1_/_-1] justify-end [padding-top:2px]">
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
        <Button htmlType="submit" theme="solid" type="primary" disabled={discovery.busy}>
          {isNew
            ? `添加供应商${splitModels(models).length ? `（${splitModels(models).length} 个模型）` : ''}`
            : '保存配置'}
        </Button>
      </div>
    </form>
  );
}
