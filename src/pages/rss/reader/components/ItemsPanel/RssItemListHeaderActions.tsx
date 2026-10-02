import { IconCheckList, IconRefresh, IconSetting } from '@douyinfe/semi-icons';
import { Button, Tooltip } from '@douyinfe/semi-ui';

export function RssItemListHeaderActions({
  daily,
  digestGenerating,
  todayKey,
  unreadItemIds,
  onGenerateDigest,
  onMarkRead,
  onOpenDigestSettings,
}: {
  daily: boolean;
  digestGenerating: boolean;
  todayKey: string;
  unreadItemIds: string[];
  onGenerateDigest: (date: string) => void;
  onMarkRead: (itemIds: string[]) => void;
  onOpenDigestSettings: () => void;
}) {
  if (daily) {
    return (
      <>
        <Tooltip content="立即更新今天的日报">
          <Button
            aria-label="立即更新今天的日报"
            icon={<IconRefresh />}
            loading={digestGenerating}
            size="small"
            theme="borderless"
            type="tertiary"
            onClick={() => onGenerateDigest(todayKey)}
          />
        </Tooltip>
        <Tooltip content="日报设置">
          <Button
            aria-label="打开日报设置"
            icon={<IconSetting />}
            size="small"
            theme="borderless"
            type="tertiary"
            onClick={onOpenDigestSettings}
          />
        </Tooltip>
      </>
    );
  }
  return (
    <Tooltip
      content={
        unreadItemIds.length
          ? `将当前列表中的 ${unreadItemIds.length} 条内容设为已读`
          : '当前列表没有未读内容'
      }
    >
      <Button
        aria-label="当前列表一键已读"
        disabled={!unreadItemIds.length}
        icon={<IconCheckList />}
        size="small"
        theme="borderless"
        type="tertiary"
        onClick={() => onMarkRead(unreadItemIds)}
      />
    </Tooltip>
  );
}
