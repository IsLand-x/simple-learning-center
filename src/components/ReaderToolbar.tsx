import { Button, ButtonGroup, Select, Tooltip, Typography } from '@douyinfe/semi-ui';
import { IconChevronLeft, IconChevronRight, IconFont, IconMinus, IconPlus } from '@douyinfe/semi-icons';
import type { ReaderPreferences, ReaderTheme } from '../types';

const { Text } = Typography;

interface ReaderToolbarProps {
  preferences: ReaderPreferences;
  onChangePreferences: (changes: Partial<ReaderPreferences>) => void;
  onPrev: () => void;
  onNext: () => void;
}

export function ReaderToolbar({
  preferences,
  onChangePreferences,
  onPrev,
  onNext,
}: ReaderToolbarProps) {
  return (
    <div className="reader-toolbar">
      <ButtonGroup>
        <Tooltip content="上一页">
          <Button aria-label="上一页" icon={<IconChevronLeft />} theme="borderless" onClick={onPrev} />
        </Tooltip>
        <Tooltip content="下一页">
          <Button aria-label="下一页" icon={<IconChevronRight />} theme="borderless" onClick={onNext} />
        </Tooltip>
      </ButtonGroup>
      <span className="reader-toolbar__divider" />
      <ButtonGroup>
        <Tooltip content="减小字号">
          <Button
            aria-label="减小字号"
            icon={<IconMinus />}
            theme="borderless"
            disabled={preferences.fontSize <= 14}
            onClick={() => onChangePreferences({ fontSize: preferences.fontSize - 1 })}
          />
        </Tooltip>
        <Button className="font-size-indicator" theme="borderless" icon={<IconFont />} disabled>
          {preferences.fontSize}
        </Button>
        <Tooltip content="增大字号">
          <Button
            aria-label="增大字号"
            icon={<IconPlus />}
            theme="borderless"
            disabled={preferences.fontSize >= 28}
            onClick={() => onChangePreferences({ fontSize: preferences.fontSize + 1 })}
          />
        </Tooltip>
      </ButtonGroup>
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
      <Text size="small" type="tertiary" className="reader-toolbar__hint">选择文字可提问或高亮</Text>
    </div>
  );
}
