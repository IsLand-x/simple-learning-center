import { useRef, useState } from 'react';
import { Button, Toast } from '@douyinfe/semi-ui';
import { IconPlus } from '@douyinfe/semi-icons';
import { requestPersistentStorage, saveEpubFile } from '../lib/epubStorage';
import { useLearningStore } from '../store/useLearningStore';

export function ImportBooksButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const addBooks = useLearningStore((state) => state.addBooks);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    const imported = [];
    const failed: string[] = [];

    try {
      await requestPersistentStorage();
      const { parseEpubFile } = await import('../lib/parseEpub');
      for (const file of Array.from(files)) {
        if (!file.name.toLowerCase().endsWith('.epub')) {
          failed.push(file.name);
          continue;
        }
        try {
          const parsed = await parseEpubFile(file);
          await saveEpubFile(parsed.item.id, parsed.data);
          imported.push(parsed.item);
        } catch {
          failed.push(file.name);
        }
      }
      if (imported.length) {
        addBooks(imported);
        Toast.success(`已导入 ${imported.length} 本书，文件保存在此设备`);
      }
      if (failed.length) {
        Toast.error(`有 ${failed.length} 个文件无法导入，请确认是有效的 EPUB`);
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        id="epub-upload"
        className="visually-hidden"
        type="file"
        accept=".epub,application/epub+zip"
        multiple
        onChange={(event) => void handleFiles(event.target.files)}
      />
      <Button
        theme="solid"
        type="primary"
        icon={<IconPlus />}
        loading={uploading}
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? '正在导入' : '导入 EPUB'}
      </Button>
    </>
  );
}
