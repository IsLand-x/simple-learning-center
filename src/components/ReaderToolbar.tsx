import { Button, ButtonGroup, Select, Tooltip } from '@douyinfe/semi-ui';
import { IconChevronLeft, IconChevronRight, IconFont, IconMinus, IconPlus, IconSidebar } from '@douyinfe/semi-icons';
import { READER_FONT_OPTIONS } from '../lib/readerFonts';
import type { ReaderFont, ReaderPreferences, ReaderTheme } from '../types';

interface ReaderToolbarProps {
  preferences: ReaderPreferences;
  tocCollapsed: boolean;
  onChangePreferences: (changes: Partial<ReaderPreferences>) => void;
  onToggleToc: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export function ReaderToolbar({
  preferences,
  tocCollapsed,
  onChangePreferences,
  onToggleToc,
  onPrev,
  onNext,
}: ReaderToolbarProps) {
  return (
    <div className="reader-toolbar">
      <Tooltip content={tocCollapsed ? '展开书籍目录' : '收起书籍目录'}>
        <Button
          aria-label={tocCollapsed ? '展开书籍目录' : '收起书籍目录'}
          icon={<IconSidebar />}
          size="small"
          theme="borderless"
          onClick={onToggleToc}
        />
      </Tooltip>
      <span className="reader-toolbar__divider" />
      <ButtonGroup>
        <Tooltip content="上一页（← / ↑）">
          <Button aria-label="上一页" icon={<IconChevronLeft />} size="small" theme="borderless" onClick={onPrev} />
        </Tooltip>
        <Tooltip content="下一页（→ / ↓）">
          <Button aria-label="下一页" icon={<IconChevronRight />} size="small" theme="borderless" onClick={onNext} />
        </Tooltip>
      </ButtonGroup>
      <span className="reader-toolbar__divider" />
      <ButtonGroup>
        <Tooltip content="减小字号">
          <Button
            aria-label="减小字号"
            icon={<IconMinus />}
            size="small"
            theme="borderless"
            disabled={preferences.fontSize <= 14}
            onClick={() => onChangePreferences({ fontSize: preferences.fontSize - 1 })}
          />
        </Tooltip>
        <Button className="font-size-indicator" size="small" theme="borderless" icon={<IconFont />} disabled>
          {preferences.fontSize}
        </Button>
        <Tooltip content="增大字号">
          <Button
            aria-label="增大字号"
            icon={<IconPlus />}
            size="small"
            theme="borderless"
            disabled={preferences.fontSize >= 28}
            onClick={() => onChangePreferences({ fontSize: preferences.fontSize + 1 })}
          />
        </Tooltip>
      </ButtonGroup>
      <Select
        aria-label="正文字体"
        size="small"
        value={preferences.fontFamily}
        onChange={(value) => onChangePreferences({ fontFamily: value as ReaderFont })}
        className="reader-font-select"
      >
        {READER_FONT_OPTIONS.map((font) => (
          <Select.Option key={font.value} value={font.value}>{font.label}</Select.Option>
        ))}
      </Select>
      <Select
        aria-label="阅读背景"
        size="small"
        value={preferences.theme}
        onChange={(value) => onChangePreferences({ theme: value as ReaderTheme })}
        className="reader-theme-select"
      >
        <Select.Option value="paper">柔和纸张</Select.Option>
        <Select.Option value="white">纯白</Select.Option>
        <Select.Option value="night">夜间</Select.Option>
      </Select>
      <Select
        aria-label="阅读行高"
        size="small"
        value={String(preferences.lineHeight)}
        onChange={(value) => onChangePreferences({ lineHeight: Number(value) })}
        className="reader-line-height-select"
      >
        <Select.Option value="1.6">紧凑</Select.Option>
        <Select.Option value="1.8">舒适</Select.Option>
        <Select.Option value="2">宽松</Select.Option>
      </Select>
    </div>
  );
}
