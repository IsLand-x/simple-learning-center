import { Button, Empty, Typography } from '@douyinfe/semi-ui';
import { IconPlus } from '@douyinfe/semi-icons';
import { createUuid } from '../../../lib/uuid';
import { useLearningStore } from '../../../store/useLearningStore';
import { ConfigEditor } from './ConfigEditor';

const { Text } = Typography;

export interface ModelSettingsProps {
  editingConfigId: string | null;
  onEditingConfigChange: (configId: string | null) => void;
}

export function ModelSettings({ editingConfigId, onEditingConfigChange }: ModelSettingsProps) {
  const configs = useLearningStore((state) => state.openAIConfigs);
  const addConfig = useLearningStore((state) => state.addOpenAIConfig);

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
    onEditingConfigChange(id);
  };

  return (
    <>
      <div className="settings-tab-actions">
        <Button icon={<IconPlus />} theme="solid" type="primary" onClick={add}>
          添加模型
        </Button>
      </div>
      <section className="settings-notice" aria-label="模型 API Key 存储说明">
        <Text strong>保存在服务器数据目录</Text>
        <Text size="small" type="tertiary">
          API Key 会写入服务器数据目录，模型请求由学习中心服务端发起，不要求供应商开放浏览器
          CORS。远程模式请务必启用访问认证和 HTTPS。
        </Text>
      </section>
      <section className="api-config-list" aria-label="AI 模型配置列表">
        {configs.length ? (
          configs.map((config) => (
            <ConfigEditor
              key={config.id}
              config={config}
              editing={editingConfigId === config.id}
              onEdit={() => onEditingConfigChange(config.id)}
              onClose={() => onEditingConfigChange(null)}
            />
          ))
        ) : (
          <Empty
            title="还没有 AI 模型"
            description="添加一个 OpenAI 兼容模型后，就能在阅读器侧栏开始对话"
          />
        )}
      </section>
    </>
  );
}
