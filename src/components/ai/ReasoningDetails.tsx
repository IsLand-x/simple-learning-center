import { IconAISearchLevel2, IconChevronDown } from '@douyinfe/semi-icons';
import { useEffect, useState, type SyntheticEvent } from 'react';
import { CspSafeMarkdown } from './CspSafeMarkdown';
export function ReasoningDetails({
  text,
  status,
  autoHideReasoning,
}: {
  text: string;
  status: string;
  autoHideReasoning: boolean;
}) {
  const [open, setOpen] = useState(status === 'in_progress' && !autoHideReasoning);

  useEffect(() => {
    setOpen(status === 'in_progress' && !autoHideReasoning);
  }, [autoHideReasoning, status]);

  const handleToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    setOpen(event.currentTarget.open);
  };

  return (
    <details
      className="semi-ai-chat-dialogue-reasoning-wrapper csp-chat-reasoning"
      open={open}
      onToggle={handleToggle}
    >
      <summary className="semi-ai-chat-dialogue-reasoning-header">
        <span className="semi-ai-chat-dialogue-reasoning-header-prefix">
          <IconAISearchLevel2 />
        </span>
        <span className="semi-ai-chat-dialogue-reasoning-header-title">
          {status === 'in_progress' ? '正在思考' : '思考过程'}
        </span>
        <span className="semi-ai-chat-dialogue-reasoning-header-suffix">
          <IconChevronDown />
        </span>
      </summary>
      <div className="semi-ai-chat-dialogue-reasoning-content">
        <CspSafeMarkdown content={text} />
      </div>
    </details>
  );
}
