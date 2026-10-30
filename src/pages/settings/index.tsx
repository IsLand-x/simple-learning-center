import { TabPane, Tabs, Typography } from '@douyinfe/semi-ui';
import { useState } from 'react';
import { ReaderAiSettingsForm } from '../../components/ai/ReaderAiSettingsForm';
import { AboutSettings } from './components/AboutSettings';
import { AccountSettings } from './components/AccountSettings';
import { McpSettings } from './components/Mcp/McpSettings';
import { ModelSettings } from './components/Models/ModelSettings';
import { OpenApiSettings } from './components/OpenApiSettings';
import { WebSearchSettings } from './components/WebSearchSettings';
import { TtsSettings } from './components/TtsSettings';
import { useSearchParams } from 'react-router-dom';

const { Title, Text } = Typography;

export function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get('tab');
  const activeTab = requestedTab === 'content-sources' ? 'about' : (requestedTab ?? 'about');
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null);

  return (
    <main className="settings-page w-full [background:var(--semi-color-bg-0)]">
      <header className="settings-header justify-between [gap:16px]">
        <div>
          <Title heading={4}>设置</Title>
          <Text type="tertiary">管理账户、AI 模型、阅读助手、联网搜索与软件信息</Text>
        </div>
      </header>

      <Tabs
        activeKey={activeTab}
        className="settings-tabs [margin-right:auto] [margin-left:auto]"
        keepDOM={false}
        onChange={(tab) => setParams({ tab }, { replace: true })}
        type="line"
      >
        <TabPane itemKey="account" tab="账户">
          <AccountSettings />
        </TabPane>
        <TabPane itemKey="models" tab="AI 模型">
          <ModelSettings
            editingConfigId={editingConfigId}
            onEditingConfigChange={setEditingConfigId}
          />
        </TabPane>
        <TabPane itemKey="ai-assistant" tab="AI 助手">
          <ReaderAiSettingsForm />
        </TabPane>
        <TabPane itemKey="tts" tab="TTS">
          <TtsSettings />
        </TabPane>
        <TabPane itemKey="web-search" tab="联网搜索">
          <section
            className="settings-notice [margin-right:auto] [margin-left:auto] [gap:4px] [margin-bottom:16px] [padding:12px_14px] [background:var(--semi-color-fill-0)] mobile:[padding:14px]"
            aria-label="联网搜索说明"
          >
            <Text strong>按需连接第三方搜索服务</Text>
            <Text size="small" type="tertiary">
              配置后，Agent 可以调用联网搜索和网页读取工具。搜索词或目标网址会发送给 Jina AI，API
              Key 保存在服务器数据目录。
            </Text>
          </section>
          <WebSearchSettings />
        </TabPane>
        <TabPane itemKey="mcp" tab="MCP">
          <McpSettings />
        </TabPane>
        <TabPane itemKey="openapi" tab="OpenAPI">
          <OpenApiSettings />
        </TabPane>
        <TabPane itemKey="about" tab="关于">
          <AboutSettings />
        </TabPane>
      </Tabs>
    </main>
  );
}
