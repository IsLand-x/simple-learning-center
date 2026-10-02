import { IconWrench } from '@douyinfe/semi-icons';
import type { ComponentType } from 'react';
import { CspSafeMarkdown } from './CspSafeMarkdown';
import { ReasoningDetails } from './ReasoningDetails';
import type { ChatContentBlock } from './chatContent';

export function ChatContentItem({
  block,
  bubbleClassName,
  autoHideReasoning,
  ImageComponent,
}: {
  block: ChatContentBlock;
  bubbleClassName: string;
  autoHideReasoning: boolean;
  ImageComponent?: ComponentType<{ src?: string; alt?: string }>;
}) {
  if (block.kind === 'markdown')
    return (
      <CspSafeMarkdown
        content={block.text}
        className={bubbleClassName}
        ImageComponent={ImageComponent}
      />
    );
  if (block.kind === 'reasoning')
    return (
      <ReasoningDetails
        text={block.text}
        status={block.status}
        autoHideReasoning={autoHideReasoning}
      />
    );
  return (
    <div
      className={`semi-ai-chat-dialogue-content-tool-call csp-chat-tool min-w-0 [max-width:100%] [justify-content:flex-start] csp-chat-tool--${block.status}`}
    >
      <IconWrench />
      <span>
        {block.status === 'failed'
          ? '调用失败'
          : block.status === 'in_progress'
            ? '正在调用'
            : '已调用'}{' '}
        {block.name}
      </span>
      {block.argumentsText && <code title={block.argumentsText}>{block.argumentsText}</code>}
    </div>
  );
}
