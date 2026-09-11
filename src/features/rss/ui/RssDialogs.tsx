import { createPortal } from 'react-dom';
import type { FormEvent } from 'react';
import {
  Button,
  Dropdown,
  Empty,
  Input,
  Modal,
  Select,
  SideSheet,
  Switch,
  Typography,
} from '@douyinfe/semi-ui';
import {
  IconBookmark,
  IconCheckList,
  IconDeleteStroked,
  IconFolderOpen,
  IconMailStroked,
  IconPlus,
  IconRefresh,
} from '@douyinfe/semi-icons';
import { formatRelativeTime } from '../../../lib/format';
import type { RssFeed, RssFeedType, RssFolder, RssItem } from '../../../types';
import { sourceTypeLabel, type RssSourceKind } from '../model/rssPageModel';

const { Text } = Typography;
const rssModalBodyStyle = { paddingBottom: 24 };

export interface RssSourceMenuState {
  feed: RssFeed;
  x: number;
  y: number;
}

export interface RssItemMenuState {
  item: RssItem;
  x: number;
  y: number;
}

export function RssAddSourceDialog({
  feedFolderId,
  feedTitle,
  feedType,
  feedUrl,
  folders,
  sourceKind,
  submitting,
  visible,
  onCancel,
  onChangeFeedFolderId,
  onChangeFeedTitle,
  onChangeFeedType,
  onChangeFeedUrl,
  onChangeSourceKind,
  onSubmit,
}: {
  feedFolderId: string;
  feedTitle: string;
  feedType: RssFeedType;
  feedUrl: string;
  folders: RssFolder[];
  sourceKind: RssSourceKind;
  submitting: boolean;
  visible: boolean;
  onCancel: () => void;
  onChangeFeedFolderId: (folderId: string) => void;
  onChangeFeedTitle: (title: string) => void;
  onChangeFeedType: (type: RssFeedType) => void;
  onChangeFeedUrl: (url: string) => void;
  onChangeSourceKind: (kind: RssSourceKind) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <Modal
      bodyStyle={rssModalBodyStyle}
      closable={false}
      title="添加订阅源"
      visible={visible}
      footer={null}
      onCancel={onCancel}
    >
      <form className="rss-dialog-form" onSubmit={onSubmit}>
        <label>
          <Text strong>内容源</Text>
          <Select
            autoFocus
            value={sourceKind}
            onChange={(value) => onChangeSourceKind(String(value) as RssSourceKind)}
          >
            <Select.Option value="rss">RSS / Atom</Select.Option>
            <Select.Option value="bilibili-weekly">B站每周必看</Select.Option>
            <Select.Option value="bilibili-up">B站指定 UP 主</Select.Option>
            <Select.Option value="youtube-channel">YouTube 频道</Select.Option>
          </Select>
        </label>
        {sourceKind !== 'bilibili-weekly' ? (
          <label>
            <Text strong>
              {sourceKind === 'rss'
                ? 'RSS / Atom 地址'
                : sourceKind === 'bilibili-up'
                  ? 'UP 主 UID 或空间地址'
                  : '频道地址、@handle 或频道 ID'}
            </Text>
            <Input
              value={feedUrl}
              onChange={onChangeFeedUrl}
              placeholder={
                sourceKind === 'rss'
                  ? 'https://example.com/feed.xml'
                  : sourceKind === 'bilibili-up'
                    ? '例如：946974'
                    : '例如：@channel 或频道地址'
              }
            />
          </label>
        ) : (
          <div className="rss-dialog-note">
            <Text size="small" type="tertiary">
              订阅 B站官方“每周必看”，刷新时自动识别最新期次。
            </Text>
          </div>
        )}
        <label>
          <Text strong>显示名称（可选）</Text>
          <Input value={feedTitle} onChange={onChangeFeedTitle} placeholder="默认使用订阅源名称" />
        </label>
        {sourceKind === 'rss' ? (
          <label>
            <Text strong>内容类型</Text>
            <Select
              value={feedType}
              onChange={(value) => onChangeFeedType(String(value) as RssFeedType)}
            >
              <Select.Option value="article">文章</Select.Option>
              <Select.Option value="video">视频</Select.Option>
              <Select.Option value="social">社交媒体</Select.Option>
            </Select>
          </label>
        ) : null}
        <label>
          <Text strong>文件夹</Text>
          <Select
            value={feedFolderId || '__none__'}
            onChange={(value) => onChangeFeedFolderId(value === '__none__' ? '' : String(value))}
          >
            <Select.Option value="__none__">未分类</Select.Option>
            {folders.map((folder) => (
              <Select.Option key={folder.id} value={folder.id}>
                {folder.name}
              </Select.Option>
            ))}
          </Select>
        </label>
        <div className="rss-dialog-actions">
          <Button theme="borderless" type="tertiary" onClick={onCancel}>
            取消
          </Button>
          <Button htmlType="submit" loading={submitting} theme="solid" type="primary">
            获取并订阅
          </Button>
        </div>
      </form>
    </Modal>
  );
}

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
    <Modal
      bodyStyle={rssModalBodyStyle}
      closable={false}
      title="新建文件夹"
      visible={visible}
      footer={null}
      onCancel={onCancel}
    >
      <form className="rss-dialog-form" onSubmit={onSubmit}>
        <label>
          <Text strong>文件夹名称</Text>
          <Input
            autoFocus
            value={folderName}
            onChange={onChangeFolderName}
            placeholder="例如：产品与科技"
          />
        </label>
        <div className="rss-dialog-actions">
          <Button theme="borderless" type="tertiary" onClick={onCancel}>
            取消
          </Button>
          <Button htmlType="submit" theme="solid" type="primary">
            创建
          </Button>
        </div>
      </form>
    </Modal>
  );
}

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
        <div className="rss-manage-drawer__footer">
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
      <div className="rss-manage-dialog">
        <section>
          <div className="rss-manage-dialog__heading">
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
              <div className="rss-manage-feed" key={feed.id}>
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
                  className="rss-manage-feed__full-content"
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

export function RssSourceContextMenu({
  items,
  menu,
  onClose,
  onDelete,
  onManage,
  onMarkRead,
  onRefresh,
}: {
  items: RssItem[];
  menu: RssSourceMenuState | null;
  onClose: () => void;
  onDelete: (feed: RssFeed) => void;
  onManage: () => void;
  onMarkRead: (itemIds: string[]) => void;
  onRefresh: (feed: RssFeed) => void;
}) {
  if (!menu) return null;
  return createPortal(
    <div className="rss-context-menu">
      <Dropdown
        autoAdjustOverflow
        closeOnEsc
        margin={0}
        motion={false}
        position="bottomLeft"
        rePosKey={`${menu.x}:${menu.y}`}
        spacing={0}
        trigger="custom"
        visible
        render={
          <Dropdown.Menu>
            <Dropdown.Item
              icon={<IconRefresh />}
              onClick={() => {
                const feed = menu.feed;
                onClose();
                onRefresh(feed);
              }}
            >
              刷新
            </Dropdown.Item>
            <Dropdown.Item
              disabled={!items.some((item) => item.feedId === menu.feed.id && !item.readAt)}
              icon={<IconCheckList />}
              onClick={() => {
                const feed = menu.feed;
                onClose();
                onMarkRead(items.filter((item) => item.feedId === feed.id).map((item) => item.id));
              }}
            >
              设为已读
            </Dropdown.Item>
            <Dropdown.Item
              icon={<IconFolderOpen />}
              onClick={() => {
                onClose();
                onManage();
              }}
            >
              管理订阅源
            </Dropdown.Item>
            <Dropdown.Item
              type="danger"
              icon={<IconDeleteStroked />}
              onClick={() => {
                const feed = menu.feed;
                onClose();
                onDelete(feed);
              }}
            >
              删除订阅源
            </Dropdown.Item>
          </Dropdown.Menu>
        }
        onVisibleChange={(visible) => {
          if (!visible) onClose();
        }}
      >
        <span
          aria-hidden="true"
          className="cursor-context-menu-anchor"
          style={{ left: menu.x, top: menu.y }}
          tabIndex={-1}
        />
      </Dropdown>
    </div>,
    document.body,
  );
}

export function RssItemContextMenu({
  menu,
  onClose,
  onMarkRead,
  onMarkUnread,
  onToggleBookmark,
}: {
  menu: RssItemMenuState | null;
  onClose: () => void;
  onMarkRead: (item: RssItem) => void;
  onMarkUnread: (item: RssItem) => void;
  onToggleBookmark: (item: RssItem) => void;
}) {
  if (!menu) return null;
  return createPortal(
    <div className="rss-context-menu">
      <Dropdown
        autoAdjustOverflow
        closeOnEsc
        margin={0}
        motion={false}
        position="bottomLeft"
        rePosKey={`${menu.x}:${menu.y}`}
        spacing={0}
        trigger="custom"
        visible
        render={
          <Dropdown.Menu>
            {menu.item.readAt ? (
              <Dropdown.Item
                icon={<IconMailStroked />}
                onClick={() => {
                  const item = menu.item;
                  onClose();
                  onMarkUnread(item);
                }}
              >
                标为未读
              </Dropdown.Item>
            ) : (
              <Dropdown.Item
                icon={<IconCheckList />}
                onClick={() => {
                  const item = menu.item;
                  onClose();
                  onMarkRead(item);
                }}
              >
                设为已读
              </Dropdown.Item>
            )}
            <Dropdown.Item
              icon={<IconBookmark />}
              onClick={() => {
                const item = menu.item;
                onClose();
                onToggleBookmark(item);
              }}
            >
              {menu.item.bookmarkedAt ? '取消收藏' : '设为收藏'}
            </Dropdown.Item>
          </Dropdown.Menu>
        }
        onVisibleChange={(visible) => {
          if (!visible) onClose();
        }}
      >
        <span
          aria-hidden="true"
          className="cursor-context-menu-anchor"
          style={{ left: menu.x, top: menu.y }}
          tabIndex={-1}
        />
      </Dropdown>
    </div>,
    document.body,
  );
}
