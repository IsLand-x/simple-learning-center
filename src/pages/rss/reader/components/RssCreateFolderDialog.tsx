import type { FormEvent } from 'react';
import { Button, Input, Typography } from '@douyinfe/semi-ui';
import { AppFormModal } from '../../../../components/AppFormModal';

const { Text } = Typography;

export function RssCreateFolderDialog({
  folderName,
  visible,
  onCancel,
  onChangeFolderName,
  onSubmit,
}: {
  folderName: string;
  visible: boolean;
  onCancel: () => void;
  onChangeFolderName: (name: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
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
