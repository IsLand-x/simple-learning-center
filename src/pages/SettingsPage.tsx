import { useState } from 'react';
import { TabPane, Tabs, Typography } from '@douyinfe/semi-ui';
import {
  AccountSettings,
  AiAssistantSettings,
  ApiKeyTransferActions,
  ContentSourceSettings,
  ModelSettings,
  WebSearchSettings,
} from '../features/settings/ui';
import { appMetadata, formatAppUpdatedAt } from '../lib/appMetadata';

const { Title, Text } = Typography;

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState('models');
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null);

  return (
    <main className="settings-page">
      <header className="settings-header">
        <div>
          <Title heading={4}>设置</Title>
          <Text type="tertiary">管理账户、内容源、AI 模型、阅读助手、联网搜索与软件信息</Text>
        </div>
        <div className="settings-header__actions">
          <ApiKeyTransferActions />
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
          <ModelSettings
            editingConfigId={editingConfigId}
            onEditingConfigChange={setEditingConfigId}
          />
        </TabPane>
        <TabPane itemKey="ai-assistant" tab="AI 助手">
          <AiAssistantSettings />
        </TabPane>
        <TabPane itemKey="content-sources" tab="内容源">
          <section className="settings-notice" aria-label="内容源凭据说明">
            <Text strong>内容抓取由学习中心服务端执行</Text>
            <Text size="small" type="tertiary">
              B站每周必看通常无需登录；指定 UP 主会先匿名请求，失败后才使用这里保存的
              Cookie。YouTube 频道使用官方公开 Feed。远程访问时必须启用应用认证，并通过 HTTPS
              反向代理打开设置页。
            </Text>
          </section>
          <ContentSourceSettings />
        </TabPane>
        <TabPane itemKey="web-search" tab="联网搜索">
          <section className="settings-notice" aria-label="联网搜索说明">
            <Text strong>按需连接第三方搜索服务</Text>
            <Text size="small" type="tertiary">
              配置后，Agent 可以调用联网搜索和网页读取工具。搜索词或目标网址会发送给 Jina AI，API
              Key 保存在服务器数据目录。
            </Text>
          </section>
          <WebSearchSettings />
        </TabPane>
        <TabPane itemKey="about" tab="关于">
          <section className="settings-about" aria-labelledby="settings-about-title">
            <div className="settings-about__heading">
              <div>
                <Title id="settings-about-title" heading={5}>
                  软件信息
                </Title>
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
