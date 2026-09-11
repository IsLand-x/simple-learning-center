import { useEffect, useState, type FormEvent } from 'react';
import { Button, Switch, TextArea, Toast, Typography } from '@douyinfe/semi-ui';
import {
  DEFAULT_READER_AI_ASSISTANT_PROMPT,
  normalizeHiddenReaderAiPromptTemplateIds,
  READER_AI_PROMPT_TEMPLATES,
} from '../lib/readerAiPrompts';
import { useLearningStore } from '../store/useLearningStore';

const { Text, Title } = Typography;

export function ReaderAiSettingsForm({
  showHeading = true,
  visible = true,
  onCancel,
  onSaved,
}: {
  showHeading?: boolean;
  visible?: boolean;
  onCancel?: () => void;
  onSaved?: () => void;
}) {
  const aiPreferences = useLearningStore((state) => state.aiPreferences);
  const setAiPreferences = useLearningStore((state) => state.setAiPreferences);
  const [promptDraft, setPromptDraft] = useState(aiPreferences.assistantPrompt);
  const [autoHideReasoningDraft, setAutoHideReasoningDraft] = useState(
    aiPreferences.autoHideReasoning,
  );
  const [hiddenTemplateIdsDraft, setHiddenTemplateIdsDraft] = useState(
    aiPreferences.hiddenPromptTemplateIds,
  );

  useEffect(() => {
    if (!visible) return;
    setPromptDraft(aiPreferences.assistantPrompt);
    setAutoHideReasoningDraft(aiPreferences.autoHideReasoning);
    setHiddenTemplateIdsDraft(aiPreferences.hiddenPromptTemplateIds);
  }, [aiPreferences, visible]);

  const normalizedPrompt = promptDraft.trim();
  const normalizedHiddenTemplateIds =
    normalizeHiddenReaderAiPromptTemplateIds(hiddenTemplateIdsDraft);
  const changed =
    normalizedPrompt !== aiPreferences.assistantPrompt ||
    autoHideReasoningDraft !== aiPreferences.autoHideReasoning ||
    normalizedHiddenTemplateIds.join('\n') !== aiPreferences.hiddenPromptTemplateIds.join('\n');

  const setTemplateVisible = (templateId: string, templateVisible: boolean) => {
    setHiddenTemplateIdsDraft((current) =>
      templateVisible
        ? current.filter((id) => id !== templateId)
        : normalizeHiddenReaderAiPromptTemplateIds([...current, templateId]),
    );
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!changed) return;
    setAiPreferences({
      assistantPrompt: normalizedPrompt,
      autoHideReasoning: autoHideReasoningDraft,
      hiddenPromptTemplateIds: normalizedHiddenTemplateIds,
    });
    Toast.success('阅读助手设置已保存');
    onSaved?.();
  };

  const isDefault =
    promptDraft === DEFAULT_READER_AI_ASSISTANT_PROMPT &&
    autoHideReasoningDraft === false &&
    hiddenTemplateIdsDraft.length === 0;

  return (
    <form
      className="ai-assistant-settings"
      aria-label={showHeading ? undefined : 'AI 助手设置表单'}
      aria-labelledby={showHeading ? 'ai-assistant-settings-title' : undefined}
      onSubmit={save}
    >
      {showHeading && (
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
      )}

      <label className="settings-field ai-assistant-settings__field">
        <Text size="small" strong>
          对话风格
        </Text>
        <TextArea
          aria-label="阅读助手自定义 Prompt"
          autosize={{ minRows: showHeading ? 8 : 6, maxRows: showHeading ? 16 : 10 }}
          maxCount={4_000}
          placeholder="例如：先用一句话回答，再列出依据；遇到新术语时给出通俗解释……"
          value={promptDraft}
          onChange={setPromptDraft}
        />
        <Text size="small" type="tertiary">
          此内容会附加到内置系统指令之后，只影响读书助手，不会替代工具、安全和数据使用规则。留空则只使用内置指令。
        </Text>
      </label>

      <section
        className="ai-assistant-settings__section"
        aria-labelledby="reader-ai-shortcuts-title"
      >
        <div className="ai-assistant-settings__section-heading">
          <Text id="reader-ai-shortcuts-title" strong>
            快捷方式
          </Text>
          <Text size="small" type="tertiary">
            控制哪些提示词按钮显示在 AI 对话框输入区域。
          </Text>
        </div>
        <div className="ai-assistant-settings__shortcut-list" role="list">
          {READER_AI_PROMPT_TEMPLATES.map((template) => {
            const templateVisible = !hiddenTemplateIdsDraft.includes(template.id);
            const descriptionId = `reader-ai-shortcut-${template.id}-description`;
            return (
              <div className="ai-assistant-settings__toggle" key={template.id} role="listitem">
                <div className="ai-assistant-settings__toggle-copy">
                  <Text strong>{template.label}</Text>
                  <Text id={descriptionId} size="small" type="tertiary" ellipsis={{ rows: 2 }}>
                    {template.prompt}
                  </Text>
                </div>
                <label className="ai-assistant-settings__switch-target">
                  <Switch
                    aria-label={`显示快捷方式：${template.label}`}
                    aria-describedby={descriptionId}
                    checked={templateVisible}
                    size="large"
                    onChange={(checked) => setTemplateVisible(template.id, checked)}
                  />
                </label>
              </div>
            );
          })}
        </div>
      </section>

      <section className="ai-assistant-settings__section">
        <div className="ai-assistant-settings__toggle">
          <div className="ai-assistant-settings__toggle-copy">
            <Text strong>自动隐藏思考过程</Text>
            <Text id="auto-hide-reasoning-description" size="small" type="tertiary">
              开启后，模型生成时默认收起思考内容；仍可点击“正在思考”手动查看。
            </Text>
          </div>
          <label className="ai-assistant-settings__switch-target">
            <Switch
              aria-label="自动隐藏思考过程"
              aria-describedby="auto-hide-reasoning-description"
              checked={autoHideReasoningDraft}
              size="large"
              onChange={setAutoHideReasoningDraft}
            />
          </label>
        </div>
      </section>

      <div className="ai-assistant-settings__footer">
        <Text size="small" type="tertiary">
          {changed ? '有尚未保存的修改' : '当前配置已保存'}
        </Text>
        <div className="ai-assistant-settings__actions">
          {onCancel && (
            <Button theme="borderless" type="tertiary" onClick={onCancel}>
              取消
            </Button>
          )}
          <Button
            disabled={isDefault}
            theme="borderless"
            type="tertiary"
            onClick={() => {
              setPromptDraft(DEFAULT_READER_AI_ASSISTANT_PROMPT);
              setAutoHideReasoningDraft(false);
              setHiddenTemplateIdsDraft([]);
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
