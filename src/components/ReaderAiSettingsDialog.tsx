import { AppFormModal } from '../shared/ui/AppFormModal';
import { ReaderAiSettingsForm } from './ReaderAiSettingsForm';

export function ReaderAiSettingsDialog({
  visible,
  onCancel,
}: {
  visible: boolean;
  onCancel: () => void;
}) {
  return (
    <AppFormModal
      bodyStyle={{ padding: 0 }}
      className="reader-ai-settings-dialog"
      closable={false}
      maskClosable
      title="AI 助手设置"
      visible={visible}
      width="min(560px, calc(100vw - 32px))"
      onCancel={onCancel}
    >
      <ReaderAiSettingsForm
        showHeading={false}
        visible={visible}
        onCancel={onCancel}
        onSaved={onCancel}
      />
    </AppFormModal>
  );
}
