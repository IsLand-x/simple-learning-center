import { Button, Empty, Typography } from '@douyinfe/semi-ui';
import { IconPlus } from '@douyinfe/semi-icons';
import { useState } from 'react';
import type { OpenAICompatibleConfig } from '../../../../../contracts/ai';
import { createUuid } from '../../../../util/uuid';
import { useLearningStore } from '../../../../store/useLearningStore';
import { ConfigEditor } from './ConfigEditor';

const { Text } = Typography;

export interface ModelSettingsProps {
  editingConfigId: string | null;
  onEditingConfigChange: (configId: string | null) => void;
}

export function ModelSettings({ editingConfigId, onEditingConfigChange }: ModelSettingsProps) {
  const configs = useLearningStore((state) => state.openAIConfigs);
  const [draft, setDraft] = useState<OpenAICompatibleConfig | null>(null);

  const add = () => {
    const timestamp = Date.now();
    const id = createUuid();
    setDraft({
      id,
      name: '',
      baseUrl: '',
      apiKey: '',
      models: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    onEditingConfigChange(id);
  };

  return (
    <>
      <div className="settings-tab-actions justify-end [margin-bottom:12px]">
        <Button
          icon={<IconPlus />}
          theme="solid"
          type="primary"
          onClick={add}
          disabled={Boolean(draft)}
        >
          添加模型
        </Button>
      </div>
      <section
        className="settings-notice [margin-right:auto] [margin-left:auto] [gap:4px] [margin-bottom:16px] [padding:12px_14px] [background:var(--semi-color-fill-0)] mobile:[padding:14px]"
        aria-label="模型 API Key 存储说明"
      >
        <Text strong>保存在服务器数据目录</Text>
        <Text size="small" type="tertiary">
          API Key 会写入服务器数据目录，模型请求由学习中心服务端发起，不要求供应商开放浏览器
          CORS。远程模式请务必启用访问认证和 HTTPS。
        </Text>
      </section>
      <section
        className="api-config-list [margin-right:auto] [margin-left:auto]"
        aria-label="AI 模型配置列表"
      >
        {draft && (
          <ConfigEditor
            key={draft.id}
            config={draft}
            isNew
            editing
            onEdit={() => undefined}
            onClose={() => {
              setDraft(null);
              onEditingConfigChange(null);
            }}
          />
        )}
        {configs.some((config) => !config.oauthProvider)
          ? configs
              .filter((config) => !config.oauthProvider)
              .map((config) => (
                <ConfigEditor
                  key={config.id}
                  config={config}
                  editing={editingConfigId === config.id}
                  onEdit={() => {
                    setDraft(null);
                    onEditingConfigChange(config.id);
                  }}
                  onClose={() => onEditingConfigChange(null)}
                />
              ))
          : !draft && <Empty title="还没有 API Key 模型" />}
      </section>
    </>
  );
}
