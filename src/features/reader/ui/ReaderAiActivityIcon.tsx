import { IconAIStrokedLevel1, IconAIFilledLevel1, IconSpin } from '@douyinfe/semi-icons';
import { useReaderAiActivity } from '../hooks/useReaderAiActivity';

export function ReaderAiActivityIcon({ className = '' }: { className?: string }) {
  const { status } = useReaderAiActivity();
  const Icon =
    status === 'running'
      ? IconSpin
      : status === 'unread'
        ? IconAIFilledLevel1
        : IconAIStrokedLevel1;
  return (
    <Icon
      aria-hidden="true"
      data-ai-activity={status}
      className={`${className} reader-ai-activity reader-ai-activity--${status}`}
      spin={status === 'running'}
    />
  );
}
