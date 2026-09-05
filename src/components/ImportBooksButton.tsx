import { useRef, useState, type ComponentProps, type ComponentRef } from 'react';
import { Button, Modal, Progress, Toast, Typography, Upload } from '@douyinfe/semi-ui';
import { IconPlus, IconUpload } from '@douyinfe/semi-icons';
import { saveEpubFile } from '../lib/epubStorage';
import { useLearningStore } from '../store/useLearningStore';
import type { BookItem } from '../types';

const { Text } = Typography;

type UploadRequest = NonNullable<ComponentProps<typeof Upload>['customRequest']>;

interface ImportBatch {
  total: number;
  completed: number;
  imported: BookItem[];
  failed: string[];
}

export function ImportBooksButton() {
  const uploadRef = useRef<ComponentRef<typeof Upload>>(null);
  const importQueueRef = useRef(Promise.resolve());
  const batchRef = useRef<ImportBatch | null>(null);
  const [visible, setVisible] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number; fileName: string } | null>(null);
  const addBooks = useLearningStore((state) => state.addBooks);

  const resetDialog = () => {
    batchRef.current = null;
    setVisible(false);
    setSelectedFiles([]);
    setProgress(null);
    window.setTimeout(() => uploadRef.current?.clear(), 0);
  };

  const finishBatch = (batch: ImportBatch) => {
    if (batch.imported.length) {
      addBooks(batch.imported);
      Toast.success(`已导入 ${batch.imported.length} 本书，文件保存在服务器数据目录`);
    }
    if (batch.failed.length) {
      const preview = batch.failed.slice(0, 2).join('、');
      Toast.error(`${batch.failed.length} 个文件无法导入：${preview}${batch.failed.length > 2 ? ' 等' : ''}`);
    }
    setUploading(false);
    resetDialog();
  };

  const handleUploadRequest: UploadRequest = ({ fileInstance, onError, onProgress, onSuccess }) => {
    importQueueRef.current = importQueueRef.current.then(async () => {
      const batch = batchRef.current;
      if (!batch) {
        onError({ status: 409 });
        return;
      }

      setProgress({ current: batch.completed + 1, total: batch.total, fileName: fileInstance.name });
      try {
        if (!fileInstance.name.toLowerCase().endsWith('.epub')) {
          throw new Error('文件扩展名不是 EPUB');
        }
        onProgress({ total: 100, loaded: 10 });
        const { parseEpubFile } = await import('../lib/parseEpub');
        const parsed = await parseEpubFile(fileInstance);
        onProgress({ total: 100, loaded: 70 });
        await saveEpubFile(parsed.item.id, parsed.data);
        batch.imported.push(parsed.item);
        onSuccess({ bookId: parsed.item.id });
      } catch {
        batch.failed.push(fileInstance.name);
        onError({ status: 400 });
      } finally {
        batch.completed += 1;
        if (batch.completed === batch.total) finishBatch(batch);
      }
    });
  };

  const startImport = () => {
    if (uploading || !selectedFiles.length) return;
    batchRef.current = {
      total: selectedFiles.length,
      completed: 0,
      imported: [],
      failed: [],
    };
    setUploading(true);
    setProgress({ current: 1, total: selectedFiles.length, fileName: selectedFiles[0].name });
    uploadRef.current?.upload();
  };

  return (
    <>
      <Button
        aria-label="导入 EPUB"
        className="import-books-button"
        theme="solid"
        type="primary"
        icon={<IconPlus size="large" />}
        onClick={() => setVisible(true)}
      >
        <span className="import-books-button__desktop">导入 EPUB</span>
        <span className="import-books-button__mobile">导入</span>
      </Button>

      <Modal
        centered
        className="epub-import-modal"
        closable={false}
        footer={null}
        title="导入 EPUB"
        visible={visible}
        width="min(560px, calc(100vw - 16px))"
        onCancel={() => {
          if (!uploading) resetDialog();
        }}
      >
        <div className="epub-import-modal__body">
          <Text type="tertiary">选择一本或多本 EPUB。解析出的书名、作者、目录和封面会随原文件一起保存。</Text>
          <Upload
            ref={uploadRef}
            accept=".epub,application/epub+zip"
            action=""
            className="epub-import-modal__upload"
            disabled={uploading}
            fileListTitle={selectedFiles.length ? `已选择 ${selectedFiles.length} 本` : '待导入文件'}
            multiple
            prompt="仅支持 EPUB 文件，单次可以选择多本"
            promptPosition="bottom"
            showClear={!uploading}
            showRetry={false}
            uploadTrigger="custom"
            customRequest={handleUploadRequest}
            onAcceptInvalid={() => Toast.warning('请选择有效的 EPUB 文件')}
            onChange={({ fileList }) => {
              setSelectedFiles(fileList.flatMap((file) => file.fileInstance ? [file.fileInstance] : []));
            }}
          >
            <Button autoFocus disabled={uploading} icon={<IconUpload />} theme="light" type="primary">
              选择 EPUB 文件
            </Button>
          </Upload>

          <div className="epub-import-modal__progress" aria-live="polite">
            {progress ? (
              <>
                <div className="epub-import-modal__progress-label">
                  <Text size="small" ellipsis={{ showTooltip: true }}>{progress.fileName}</Text>
                  <Text size="small" type="tertiary">{progress.current}/{progress.total}</Text>
                </div>
                <Progress percent={Math.round(((progress.current - 1) / progress.total) * 100)} showInfo={false} />
              </>
            ) : (
              <Text size="small" type="tertiary">文件只会上传到当前学习中心的数据服务。</Text>
            )}
          </div>

          <div className="epub-import-modal__actions">
            <Button disabled={uploading} theme="borderless" type="tertiary" onClick={resetDialog}>取消</Button>
            <Button
              disabled={!selectedFiles.length || uploading}
              loading={uploading}
              theme="solid"
              type="primary"
              onClick={startImport}
            >
              {uploading ? '正在导入' : selectedFiles.length ? `导入 ${selectedFiles.length} 本书` : '开始导入'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
