import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Button, Empty, Input, TabPane, Tabs, Tag, TextArea, Toast, Tooltip, Typography } from '@douyinfe/semi-ui';
import {
  IconAlertTriangle,
  IconDeleteStroked,
  IconEditStroked,
  IconExport,
  IconGlobeStroked,
  IconImport,
  IconKeyStroked,
  IconPlus,
} from '@douyinfe/semi-icons';
import { downloadApiKeys, uploadApiKeys } from '../lib/apiKeyTransfer';
import { appMetadata, formatAppUpdatedAt } from '../lib/appMetadata';
import { getAuthSession, logout, updateCredentials } from '../lib/auth';
import { confirmDialog } from '../lib/confirmDialog';
import { refreshServerState } from '../lib/serverStateStorage';
import { createUuid } from '../lib/uuid';
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

function WebSearchSettings() {
  const config = useLearningStore((state) => state.webSearchConfig);
  const setWebSearchConfig = useLearningStore((state) => state.setWebSearchConfig);
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [editing, setEditing] = useState(false);

  useEffect(() => setApiKey(config.apiKey), [config.apiKey]);

  const save = (event: FormEvent) => {
    event.preventDefault();
    setWebSearchConfig({ apiKey: apiKey.trim() });
    Toast.success('联网搜索配置已保存');
    setEditing(false);
  };

  if (!editing) {
    return (
      <article className="api-config-summary web-search-summary">
        <div className="api-config-summary__identity">
          <IconGlobeStroked size="large" />
          <div>
            <Text strong>Jina Search &amp; Reader</Text>
            <Text size="small" type="tertiary">联网搜索服务</Text>
          </div>
        </div>
        <div className="api-config-summary__models" aria-label="联网搜索支持的工具">
          <Tag size="small" color="grey">联网搜索</Tag>
          <Tag size="small" color="grey">网页读取</Tag>
        </div>
        <div className="api-config-summary__meta">
          <Tag size="small" color={config.apiKey ? 'green' : 'amber'}>{config.apiKey ? 'Key 已配置' : 'Key 未配置'}</Tag>
        </div>
        <div className="api-config-summary__actions">
          <Button
            aria-label="编辑联网搜索配置"
            icon={<IconEditStroked />}
            size="small"
            theme="borderless"
            type="tertiary"
            onClick={() => setEditing(true)}
          />
        </div>
      </article>
    );
  }

  return (
    <form className="web-search-settings web-search-settings--editing" aria-labelledby="web-search-settings-title" onSubmit={save}>
      <div className="web-search-settings__heading">
        <div className="web-search-settings__identity">
          <IconGlobeStroked size="large" />
          <div>
            <Text id="web-search-settings-title" strong>联网搜索</Text>
            <Text size="small" type="tertiary">通过 Jina Search 和 Reader 为 Agent 提供网页检索与正文读取</Text>
          </div>
        </div>
        <Text size="small" type="tertiary">编辑联网搜索配置</Text>
      </div>
      <label className="settings-field">
        <Text size="small" strong>Jina API Key</Text>
        <Input
          type="password"
          value={apiKey}
          onChange={setApiKey}
          placeholder="jina_…"
          autoComplete="off"
        />
        <Text size="small" type="tertiary">
          配置保存在服务器数据目录。Agent 调用联网工具时，搜索词或目标网址会发送给 Jina AI。
        </Text>
      </label>
      <div className="web-search-settings__footer">
        <Button
          theme="borderless"
          type="tertiary"
          onClick={() => {
            setApiKey(config.apiKey);
            setEditing(false);
          }}
        >
          取消
        </Button>
        <Button htmlType="submit" theme="solid" type="primary">保存配置</Button>
      </div>
    </form>
  );
}

function AccountSettings() {
  const [remoteMode, setRemoteMode] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let active = true;
    void getAuthSession()
      .then((session) => {
        if (!active) return;
        setRemoteMode(session.mode === 'remote');
      })
      .catch((error) => Toast.error(error instanceof Error ? error.message : '无法读取账户信息'))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (password.length < 8) {
      Toast.warning('新密码至少需要 8 个字符');
      return;
    }
    if (password !== confirmPassword) {
      Toast.warning('两次输入的新密码不一致');
      return;
    }
    setSaving(true);
    try {
      await updateCredentials({
        password,
      });
      setPassword('');
      setConfirmPassword('');
      Toast.success('密码已更新');
    } catch (error) {
      Toast.error(error instanceof Error ? error.message : '账户信息更新失败');
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    if (!remoteMode) {
      Toast.info('当前为本地模式，没有登录会话需要退出');
      return;
    }
    setSigningOut(true);
    try {
      await logout();
      window.location.reload();
    } catch (error) {
      Toast.error(error instanceof Error ? error.message : '退出账号失败');
      setSigningOut(false);
    }
  };

  return (
    <form className="account-settings" aria-labelledby="account-settings-title" onSubmit={save}>
      <div className="account-settings__heading">
        <div>
          <Title id="account-settings-title" heading={5}>登录账户</Title>
          <Text size="small" type="tertiary">
            为当前账号设置新密码，更新后其他浏览器中的旧登录状态会立即失效
          </Text>
        </div>
      </div>
      <div className="account-settings__fields">
        <label className="settings-field">
          <Text size="small" strong>新密码</Text>
          <Input
            disabled={loading}
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            placeholder="至少 8 个字符"
          />
        </label>
        <label className="settings-field">
          <Text size="small" strong>确认新密码</Text>
          <Input
            disabled={loading}
            type="password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
          />
        </label>
      </div>
      <div className="account-settings__footer">
        <Text size="small" type="tertiary">
          凭据保存在服务器数据目录，不会写入浏览器存储或构建产物。
        </Text>
        <Button
          disabled={loading || !password || !confirmPassword}
          htmlType="submit"
          loading={saving}
          theme="solid"
          type="primary"
        >
          更新密码
        </Button>
      </div>
      <div className="account-settings__logout">
        <Button
          block
          disabled={loading || saving}
          htmlType="button"
          loading={signingOut}
          theme="solid"
          type="danger"
          onClick={signOut}
        >
          退出账号
        </Button>
        {!remoteMode ? (
          <Text size="small" type="tertiary">当前为本地模式，没有登录会话需要退出</Text>
        ) : null}
      </div>
    </form>
  );
}

export function SettingsPage() {
  const configs = useLearningStore((state) => state.openAIConfigs);
  const addConfig = useLearningStore((state) => state.addOpenAIConfig);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('models');
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const add = () => {
    const timestamp = Date.now();
    const id = createUuid();
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

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImporting(true);
    try {
      const result = await uploadApiKeys(file);
      await refreshServerState();
      await useLearningStore.persist.rehydrate();
      const details = [
        result.imported.added ? `新增 ${result.imported.added} 个模型配置` : '',
        result.imported.updated ? `更新 ${result.imported.updated} 个模型 Key` : '',
        result.imported.webSearch ? '更新联网搜索 Key' : '',
      ].filter(Boolean).join('，');
      Toast.success(details ? `API Key 已导入：${details}` : '导入文件中没有可更新的 API Key');
    } catch (error) {
      Toast.error(error instanceof Error ? error.message : 'API Key 导入失败');
    } finally {
      setImporting(false);
    }
  };

  const confirmExport = () => {
    confirmDialog({
      title: '导出 API Key？',
      content: '导出的 JSON 文件包含明文 API Key，请仅保存在可信设备并妥善保管。',
      icon: <IconAlertTriangle size="large" style={{ color: 'var(--semi-color-warning)' }} />,
      okText: '导出',
      cancelText: '取消',
      onOk: async () => {
        setExporting(true);
        try {
          await downloadApiKeys();
          Toast.success('API Key 已导出');
        } catch (error) {
          Toast.error(error instanceof Error ? error.message : 'API Key 导出失败');
          throw error;
        } finally {
          setExporting(false);
        }
      },
    });
  };

  return (
    <main className="settings-page">
      <header className="settings-header">
        <div>
          <Title heading={4}>设置</Title>
          <Text type="tertiary">管理账户、AI 模型、联网搜索与软件信息</Text>
        </div>
        <div className="settings-header__actions">
          <input
            ref={importInputRef}
            className="settings-import-input"
            type="file"
            accept="application/json,.json"
            onChange={handleImport}
          />
          <Button
            aria-label="导入 API Key"
            icon={<IconImport />}
            loading={importing}
            disabled={exporting}
            onClick={() => importInputRef.current?.click()}
          >
            导入 API Key
          </Button>
          <Button
            aria-label="导出 API Key"
            icon={<IconExport />}
            loading={exporting}
            disabled={importing}
            onClick={confirmExport}
          >
            导出 API Key
          </Button>
        </div>
      </header>

      <Tabs
        activeKey={activeTab}
        className="settings-tabs"
        keepDOM={false}
        onChange={setActiveTab}
        type="line"
      >
        <TabPane itemKey="account" tab="账户">
          <AccountSettings />
        </TabPane>
        <TabPane itemKey="models" tab="AI 模型">
          <div className="settings-tab-actions">
            <Button icon={<IconPlus />} theme="solid" type="primary" onClick={add}>添加模型</Button>
          </div>
          <section className="settings-notice" aria-label="模型 API Key 存储说明">
            <Text strong>保存在服务器数据目录</Text>
            <Text size="small" type="tertiary">
              API Key 会写入服务器数据目录，模型请求由学习中心服务端发起，不要求供应商开放浏览器 CORS。远程模式请务必启用访问认证和 HTTPS。
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
        </TabPane>
        <TabPane itemKey="web-search" tab="联网搜索">
          <section className="settings-notice" aria-label="联网搜索说明">
            <Text strong>按需连接第三方搜索服务</Text>
            <Text size="small" type="tertiary">
              配置后，Agent 可以调用联网搜索和网页读取工具。搜索词或目标网址会发送给 Jina AI，API Key 保存在服务器数据目录。
            </Text>
          </section>
          <WebSearchSettings />
        </TabPane>
        <TabPane itemKey="about" tab="关于">
          <section className="settings-about" aria-labelledby="settings-about-title">
            <div className="settings-about__heading">
              <div>
                <Title id="settings-about-title" heading={5}>软件信息</Title>
                <Text size="small" type="tertiary">
                  更新于 {formatAppUpdatedAt(appMetadata.updatedAt)}
                </Text>
              </div>
              <code className="settings-about__version">{appMetadata.version}</code>
            </div>
          </section>
        </TabPane>
      </Tabs>
    </main>
  );
}
