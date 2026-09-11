import { useEffect, useState, type FormEvent } from 'react';
import { Button, Switch, TextArea, Toast, Typography } from '@douyinfe/semi-ui';
import { DEFAULT_READER_AI_ASSISTANT_PROMPT } from '../../../lib/readerAiPrompts';
import { useLearningStore } from '../../../store/useLearningStore';

const { Text, Title } = Typography;

export function AiAssistantSettings() {
  const assistantPrompt = useLearningStore((state) => state.aiPreferences.assistantPrompt);
  const autoHideReasoning = useLearningStore((state) => state.aiPreferences.autoHideReasoning);
  const setAiPreferences = useLearningStore((state) => state.setAiPreferences);
  const [draft, setDraft] = useState(assistantPrompt);
  const [autoHideReasoningDraft, setAutoHideReasoningDraft] = useState(autoHideReasoning);

  useEffect(() => setDraft(assistantPrompt), [assistantPrompt]);
  useEffect(() => setAutoHideReasoningDraft(autoHideReasoning), [autoHideReasoning]);

  const normalizedDraft = draft.trim();
  const changed =
    normalizedDraft !== assistantPrompt || autoHideReasoningDraft !== autoHideReasoning;
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!changed) return;
    setAiPreferences({
      assistantPrompt: normalizedDraft,
      autoHideReasoning: autoHideReasoningDraft,
    });
    Toast.success('阅读助手设置已保存');
  };

  return (
    <form
      className="ai-assistant-settings"
      aria-labelledby="ai-assistant-settings-title"
      onSubmit={save}
    >
      <div className="ai-assistant-settings__heading">
        <div>
          <Title id="ai-assistant-settings-title" heading={5}>
            阅读助手 Prompt
          </Title>
          <Text size="small" type="tertiary">
            调整读书详情中 AI 助手的长期对话风格和回答方式
          </Text>
        </div>
      </div>

      <label className="settings-field ai-assistant-settings__field">
        <Text size="small" strong>
          对话风格
        </Text>
        <TextArea
          aria-label="阅读助手自定义 Prompt"
          autosize={{ minRows: 8, maxRows: 16 }}
          maxCount={4_000}
          placeholder="例如：先用一句话回答，再列出依据；遇到新术语时给出通俗解释……"
          value={draft}
          onChange={setDraft}
        />
        <Text size="small" type="tertiary">
          此内容会附加到内置系统指令之后，只影响读书助手，不会替代工具、安全和数据使用规则。留空则只使用内置指令。
        </Text>
      </label>

      <div className="ai-assistant-settings__toggle">
        <div className="ai-assistant-settings__toggle-copy">
          <Text strong>自动隐藏思考过程</Text>
          <Text id="auto-hide-reasoning-description" size="small" type="tertiary">
            开启后，模型生成时默认收起思考内容；仍可点击“正在思考”手动查看。
          </Text>
        </div>
        <Switch
          aria-label="自动隐藏思考过程"
          aria-describedby="auto-hide-reasoning-description"
          checked={autoHideReasoningDraft}
          size="large"
          onChange={setAutoHideReasoningDraft}
        />
      </div>

      <div className="ai-assistant-settings__footer">
        <Text size="small" type="tertiary">
          {changed ? '有尚未保存的修改' : '当前配置已保存'}
        </Text>
        <div className="ai-assistant-settings__actions">
          <Button
            disabled={
              draft === DEFAULT_READER_AI_ASSISTANT_PROMPT && autoHideReasoningDraft === false
            }
            theme="borderless"
            type="tertiary"
            onClick={() => {
              setDraft(DEFAULT_READER_AI_ASSISTANT_PROMPT);
              setAutoHideReasoningDraft(false);
            }}
          >
            恢复默认
          </Button>
          <Button disabled={!changed} htmlType="submit" theme="solid" type="primary">
            保存设置
          </Button>
        </div>
      </div>
    </form>
  );
}
