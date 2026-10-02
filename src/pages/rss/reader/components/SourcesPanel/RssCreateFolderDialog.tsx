import { Button, Input, Typography } from '@douyinfe/semi-ui';
import type { FormEvent } from 'react';
import { AppFormModal } from '../../../../../components/AppFormModal';
import { useLearningStore } from '../../../../../store/useLearningStore';
import { useWorkspace } from '../../store/WorkspaceContext';

const { Text } = Typography;

import { Toast } from '@douyinfe/semi-ui';
import { useState } from 'react';
import { createUuid } from '../../../../../util/uuid';
export function RssCreateFolderDialog() {
  const folders = useLearningStore((state) => state.rssFolders);
  const {
    sources: { folderVisible: visible, setFolderVisible, setCreatedFolderId, setExpandedFolders },
  } = useWorkspace();
  const [folderName, setFolderName] = useState('');
  const addRssFolder = useLearningStore((state) => state.addRssFolder);
  const onCancel = () => setFolderVisible(false);
  const onChangeFolderName = setFolderName;
  const createFolder = (event: FormEvent) => {
    event.preventDefault();
    const name = folderName.trim();
    if (!name) return;
    if (folders.some((folder) => folder.name === name)) {
      Toast.warning('同名文件夹已经存在');
      return;
    }
    const timestamp = Date.now();
    const folder = { id: createUuid(), name, createdAt: timestamp, updatedAt: timestamp };
    addRssFolder(folder);
    setCreatedFolderId(folder.id);
    setExpandedFolders((current) => new Set(current).add(folder.id));
    setFolderName('');
    onCancel();
  };

  const onSubmit = createFolder;
  return (
    <AppFormModal closable={false} title="新建文件夹" visible={visible} onCancel={onCancel}>
      <form className="rss-dialog-form [gap:16px]" onSubmit={onSubmit}>
        <label>
          <Text strong>文件夹名称</Text>
          <Input
            autoFocus
            value={folderName}
            onChange={onChangeFolderName}
            placeholder="例如：产品与科技"
          />
        </label>
        <div className="rss-dialog-actions justify-end [padding-top:4px]">
          <Button theme="borderless" type="tertiary" onClick={onCancel}>
            取消
          </Button>
          <Button htmlType="submit" theme="solid" type="primary">
            创建
          </Button>
        </div>
      </form>
    </AppFormModal>
  );
}
