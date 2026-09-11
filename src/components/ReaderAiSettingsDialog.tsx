import { Modal } from '@douyinfe/semi-ui';
import { ReaderAiSettingsForm } from './ReaderAiSettingsForm';

export function ReaderAiSettingsDialog({
  visible,
  onCancel,
}: {
  visible: boolean;
  onCancel: () => void;
}) {
  return (
    <Modal
      bodyStyle={{ padding: 0 }}
      className="reader-ai-settings-dialog"
      closable={false}
      footer={null}
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
    </Modal>
  );
}
