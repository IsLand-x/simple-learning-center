import { useEffect, useState, type FormEvent } from 'react';
import { Button, Input, Tag, Toast, Typography } from '@douyinfe/semi-ui';
import { IconEditStroked, IconGlobeStroked } from '@douyinfe/semi-icons';
import { useLearningStore } from '../../../util/state/useLearningStore';

const { Text } = Typography;

export function WebSearchSettings() {
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
      <article className="api-config-summary [min-height:64px] [gap:16px] [padding:10px_12px] [background:var(--semi-color-bg-1)] [@media(max-width:860px)]:flex-wrap [@media(max-width:720px)]:[gap:10px] mobile:[padding:10px] web-search-summary [margin:0_auto]">
        <div className="api-config-summary__identity [width:220px] min-w-0 [color:var(--semi-color-text-1)]">
          <IconGlobeStroked size="large" />
          <div>
            <Text strong>Jina Search &amp; Reader</Text>
            <Text size="small" type="tertiary">
              联网搜索服务
            </Text>
          </div>
        </div>
        <div
          className="api-config-summary__models min-w-0 [gap:4px] [@media(max-width:860px)]:[order:3]"
          aria-label="联网搜索支持的工具"
        >
          <Tag size="small" color="grey">
            联网搜索
          </Tag>
          <Tag size="small" color="grey">
            网页读取
          </Tag>
        </div>
        <div className="api-config-summary__meta whitespace-nowrap [@media(max-width:720px)]:[order:4]">
          <Tag size="small" color={config.apiKey ? 'green' : 'amber'}>
            {config.apiKey ? 'Key 已配置' : 'Key 未配置'}
          </Tag>
        </div>
        <div className="api-config-summary__actions [gap:2px]">
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
    <form
      className="web-search-settings [margin-right:auto] [margin-left:auto] [padding:18px] [background:var(--semi-color-bg-1)] mobile:[padding:14px] web-search-settings--editing"
      aria-labelledby="web-search-settings-title"
      onSubmit={save}
    >
      <div className="web-search-settings__heading justify-between">
        <div className="web-search-settings__identity min-w-0 [color:var(--semi-color-text-1)]">
          <IconGlobeStroked size="large" />
          <div>
            <Text id="web-search-settings-title" strong>
              联网搜索
            </Text>
            <Text size="small" type="tertiary">
              通过 Jina Search 和 Reader 提供网页检索与动态网页正文读取
            </Text>
          </div>
        </div>
        <Text size="small" type="tertiary">
          编辑联网搜索配置
        </Text>
      </div>
      <label className="settings-field min-w-0 [gap:6px] [@media(max-width:860px)]:[grid-column:1_/_-1]">
        <Text size="small" strong>
          Jina API Key
        </Text>
        <Input
          type="password"
          value={apiKey}
          onChange={setApiKey}
          placeholder="jina_…"
          autoComplete="off"
        />
        <Text size="small" type="tertiary">
          配置保存在服务器数据目录。Agent 调用联网工具，或 RSS
          静态抓取无法读取动态网页时，搜索词或目标网址会发送给 Jina AI。
        </Text>
      </label>
      <div className="web-search-settings__footer justify-end">
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
        <Button htmlType="submit" theme="solid" type="primary">
          保存配置
        </Button>
      </div>
    </form>
  );
}
