import { Button, Empty, Input, Select, SideSheet, Switch, Typography } from '@douyinfe/semi-ui';
import { IconDeleteStroked, IconPlus } from '@douyinfe/semi-icons';
import { formatRelativeTime } from '../../../../util/format';
import type { RssFeed, RssFeedType, RssFolder } from '../../../../util/types';
import { sourceTypeLabel } from '../store/model/rssPageModel';

const { Text } = Typography;

export function RssManageSourcesSheet({
  feeds,
  folders,
  mobileLayout,
  visible,
  onChangeFeedFolder,
  onChangeFeedType,
  onClose,
  onCreateFolder,
  onDeleteFeed,
  onDeleteFolder,
  onRenameFolder,
  onToggleFullContent,
}: {
  feeds: RssFeed[];
  folders: RssFolder[];
  mobileLayout: boolean;
  visible: boolean;
  onChangeFeedFolder: (feed: RssFeed, folderId?: string) => void;
  onChangeFeedType: (feed: RssFeed, type: RssFeedType) => void;
  onClose: () => void;
  onCreateFolder: () => void;
  onDeleteFeed: (feed: RssFeed) => void;
  onDeleteFolder: (folder: RssFolder) => void;
  onRenameFolder: (folder: RssFolder, name: string) => void;
  onToggleFullContent: (feed: RssFeed, enabled: boolean) => void;
}) {
  return (
    <SideSheet
      aria-label="管理订阅源"
      bodyStyle={{ padding: 0 }}
      closable={false}
      footer={
        <div className="rss-manage-drawer__footer justify-end [padding:12px_24px]">
          <Button theme="solid" type="primary" onClick={onClose}>
            完成
          </Button>
        </div>
      }
      maskClosable
      placement="right"
      title="管理订阅源"
      visible={visible}
      width={mobileLayout ? '100vw' : 'min(820px, 92vw)'}
      onCancel={onClose}
    >
      <div className="rss-manage-dialog [grid-template-columns:220px_minmax(0,_1fr)] [gap:24px] [min-height:calc(100vh_-_132px)] [padding:20px_24px_32px] [@media(max-width:560px)]:[grid-template-columns:1fr]">
        <section>
          <div className="rss-manage-dialog__heading justify-between">
            <Text strong>文件夹</Text>
            <Button
              icon={<IconPlus />}
              size="small"
              theme="borderless"
              type="tertiary"
              onClick={onCreateFolder}
            >
              新建
            </Button>
          </div>
          {folders.length ? (
            folders.map((folder) => (
              <div className="rss-manage-folder" key={folder.id}>
                <Input
                  defaultValue={folder.name}
                  onBlur={(event) => {
                    const name = event.target.value.trim();
                    if (name && name !== folder.name) onRenameFolder(folder, name);
                  }}
                />
                <Button
                  aria-label={`删除文件夹 ${folder.name}`}
                  icon={<IconDeleteStroked />}
                  theme="borderless"
                  type="danger"
                  onClick={() => onDeleteFolder(folder)}
                />
              </div>
            ))
          ) : (
            <Text type="tertiary">还没有文件夹</Text>
          )}
        </section>
        <section>
          <Text strong>订阅源</Text>
          {feeds.length ? (
            feeds.map((feed) => (
              <div
                className="rss-manage-feed [grid-template-columns:minmax(130px,_1fr)_120px_90px_104px_32px] [padding:8px_0] [@media(max-width:560px)]:[grid-template-columns:minmax(0,_1fr)_36px]"
                key={feed.id}
              >
                <div>
                  <Text strong>{feed.title}</Text>
                  <Text size="small" type="tertiary" ellipsis={{ showTooltip: true }}>
                    {sourceTypeLabel(feed.source)} · {feed.url}
                  </Text>
                  {feed.lastSuccessAt ? (
                    <Text size="small" type="tertiary">
                      最近成功：{formatRelativeTime(feed.lastSuccessAt)}
                    </Text>
                  ) : null}
                  {feed.lastError ? (
                    <Text size="small" type="danger" ellipsis={{ showTooltip: true }}>
                      {feed.lastError}
                    </Text>
                  ) : null}
                </div>
                <Select
                  size="small"
                  value={feed.folderId || '__none__'}
                  onChange={(value) =>
                    onChangeFeedFolder(feed, value === '__none__' ? undefined : String(value))
                  }
                >
                  <Select.Option value="__none__">未分类</Select.Option>
                  {folders.map((folder) => (
                    <Select.Option key={folder.id} value={folder.id}>
                      {folder.name}
                    </Select.Option>
                  ))}
                </Select>
                <Select
                  size="small"
                  value={feed.type}
                  onChange={(value) => onChangeFeedType(feed, String(value) as RssFeedType)}
                >
                  <Select.Option value="article">文章</Select.Option>
                  <Select.Option value="video">视频</Select.Option>
                  <Select.Option value="social">社交媒体</Select.Option>
                </Select>
                <label
                  className="rss-manage-feed__full-content [min-height:32px] [gap:7px] whitespace-nowrap [@media(max-width:560px)]:[grid-column:1_/_-1]"
                  title="刷新该订阅源时自动补抓原网页正文"
                >
                  <Switch
                    aria-label={`${feed.title} 自动抓取原文`}
                    checked={Boolean(feed.fetchFullContent)}
                    disabled={feed.source.kind !== 'rss'}
                    size="small"
                    onChange={(checked) => onToggleFullContent(feed, checked)}
                  />
                  <Text size="small">{feed.source.kind === 'rss' ? '自动原文' : '原生内容'}</Text>
                </label>
                <Button
                  aria-label={`删除订阅源 ${feed.title}`}
                  icon={<IconDeleteStroked />}
                  theme="borderless"
                  type="danger"
                  onClick={() => onDeleteFeed(feed)}
                />
              </div>
            ))
          ) : (
            <Empty title="还没有订阅源" />
          )}
        </section>
      </div>
    </SideSheet>
  );
}
