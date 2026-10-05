import { useState } from 'react';
import { AppFormModal } from '../../../../../components/AppFormModal';
import { ReaderAiSettingsForm } from '../../../../../components/ai/ReaderAiSettingsForm';

export function ReaderAiSettingsDialog({
  visible,
  onCancel,
}: {
  visible: boolean;
  onCancel: () => void;
}) {
  const [footerHost, setFooterHost] = useState<HTMLDivElement | null>(null);
  return (
    <AppFormModal
      centered
      footer={<div ref={setFooterHost} />}
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
        footerHost={footerHost}
        showHeading={false}
        visible={visible}
        onCancel={onCancel}
        onSaved={onCancel}
      />
    </AppFormModal>
  );
}
