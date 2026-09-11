import { useRef, useState, type ChangeEvent } from 'react';
import { Button, Toast } from '@douyinfe/semi-ui';
import { IconAlertTriangle, IconExport, IconImport } from '@douyinfe/semi-icons';
import { downloadApiKeys, uploadApiKeys } from '../../../lib/apiKeyTransfer';
import { confirmDialog } from '../../../lib/confirmDialog';
import { synchronizeLearningState } from '../../../lib/learningStateSync';

export function ApiKeyTransferActions() {
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImporting(true);
    try {
      const result = await uploadApiKeys(file);
      await synchronizeLearningState();
      const details = [
        result.imported.added ? `新增 ${result.imported.added} 个模型配置` : '',
        result.imported.updated ? `更新 ${result.imported.updated} 个模型 Key` : '',
        result.imported.webSearch ? '更新联网搜索 Key' : '',
      ]
        .filter(Boolean)
        .join('，');
      Toast.success(details ? `API Key 已导入：${details}` : '导入文件中没有可更新的 API Key');
    } catch (error) {
      Toast.error(error instanceof Error ? error.message : 'API Key 导入失败');
    } finally {
      setImporting(false);
    }
  };

  const confirmExport = () => {
    confirmDialog({
      title: '导出 API Key？',
      content: '导出的 JSON 文件包含明文 API Key，请仅保存在可信设备并妥善保管。',
      icon: <IconAlertTriangle size="large" style={{ color: 'var(--semi-color-warning)' }} />,
      okText: '导出',
      cancelText: '取消',
      onOk: async () => {
        setExporting(true);
        try {
          await downloadApiKeys();
          Toast.success('API Key 已导出');
        } catch (error) {
          Toast.error(error instanceof Error ? error.message : 'API Key 导出失败');
          throw error;
        } finally {
          setExporting(false);
        }
      },
    });
  };

  return (
    <>
      <input
        ref={importInputRef}
        className="settings-import-input"
        type="file"
        accept="application/json,.json"
        onChange={handleImport}
      />
      <Button
        aria-label="导入 API Key"
        icon={<IconImport />}
        loading={importing}
        disabled={exporting}
        onClick={() => importInputRef.current?.click()}
      >
        导入 API Key
      </Button>
      <Button
        aria-label="导出 API Key"
        icon={<IconExport />}
        loading={exporting}
        disabled={importing}
        onClick={confirmExport}
      >
        导出 API Key
      </Button>
    </>
  );
}
