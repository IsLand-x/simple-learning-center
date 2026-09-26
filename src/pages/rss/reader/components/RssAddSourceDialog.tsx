import type { FormEvent } from 'react';
import { Button, Input, Select, Typography } from '@douyinfe/semi-ui';
import { AppFormModal } from '../../../../components/AppFormModal';
import type { RssFeedType, RssFolder } from '../../../../util/types';
import { type RssSourceKind } from '../store/model/rssPageModel';

const { Text } = Typography;

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
    <AppFormModal closable={false} title="添加订阅源" visible={visible} onCancel={onCancel}>
      <form className="rss-dialog-form [gap:16px]" onSubmit={onSubmit}>
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
          <div className="rss-dialog-note [padding:10px_12px] [background:var(--semi-color-fill-0)]">
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
        <div className="rss-dialog-actions justify-end [padding-top:4px]">
          <Button theme="borderless" type="tertiary" onClick={onCancel}>
            取消
          </Button>
          <Button htmlType="submit" loading={submitting} theme="solid" type="primary">
            获取并订阅
          </Button>
        </div>
      </form>
    </AppFormModal>
  );
}
