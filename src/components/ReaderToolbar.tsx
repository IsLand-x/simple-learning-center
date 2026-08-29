import { useEffect, useState } from 'react';
import { Button, ButtonGroup, ColorPicker, InputNumber, Popover, Select, Tooltip } from '@douyinfe/semi-ui';
import { IconChevronLeft, IconChevronRight, IconColorPalette, IconSidebar } from '@douyinfe/semi-icons';
import { ensureReaderFontStylesheet, READER_FONT_OPTIONS, READER_FONT_STACKS } from '../lib/readerFonts';
import {
  DEFAULT_READER_CUSTOM_STYLE,
  getReaderThemeName,
  getReaderTextureStyle,
  READER_DENSITY_PRESETS,
  READER_THEME_PRESETS,
  READER_TEXTURE_PRESETS,
  resolveReaderStyle,
} from '../lib/readerThemes';
import type { ReaderCustomStyle, ReaderFont, ReaderPreferences } from '../types';

interface ReaderToolbarProps {
  preferences: ReaderPreferences;
  tocCollapsed: boolean;
  onChangePreferences: (changes: Partial<ReaderPreferences>) => void;
  onToggleToc: () => void;
  onPrev: () => void;
  onNext: () => void;
  stylePopoverVisible: boolean;
  onStylePopoverVisibleChange: (visible: boolean) => void;
}

function FontPreview({ font, label }: { font: ReaderFont; label: string }) {
  return (
    <span className="reader-font-option" style={{ fontFamily: READER_FONT_STACKS[font] }}>
      {label}
    </span>
  );
}

export function ReaderToolbar({
  preferences,
  tocCollapsed,
  onChangePreferences,
  onToggleToc,
  onPrev,
  onNext,
  stylePopoverVisible,
  onStylePopoverVisibleChange,
}: ReaderToolbarProps) {
  const [visibleColorPicker, setVisibleColorPicker] = useState<'paper' | 'text' | null>(null);

  useEffect(() => {
    void Promise.all(READER_FONT_OPTIONS.map((font) => ensureReaderFontStylesheet(document, font.value)));
  }, []);

  useEffect(() => {
    if (!stylePopoverVisible) setVisibleColorPicker(null);
  }, [stylePopoverVisible]);

  const customStyle = preferences.customStyle;
  const customPreview = resolveReaderStyle({ ...preferences, theme: 'custom' });

  const updateCustomStyle = (changes: Partial<ReaderCustomStyle>) => {
    onChangePreferences({
      theme: 'custom',
      customStyle: { ...customStyle, ...changes },
    });
  };

  const stylePanel = (
    <div className="reader-style-panel" aria-label="阅读样式设置">
      <div className="reader-style-panel__heading">
        <strong>阅读预设</strong>
        <span>选择后立即应用</span>
      </div>
      <div className="reader-style-presets">
        {READER_THEME_PRESETS.map((preset) => (
          <Button
            aria-pressed={preferences.theme === preset.id}
            className={`reader-style-preset${preferences.theme === preset.id ? ' reader-style-preset--active' : ''}`}
            key={preset.id}
            onClick={() => onChangePreferences({ theme: preset.id })}
            theme="borderless"
          >
            <span
              className="reader-style-preset__sample"
              style={{
                color: preset.textColor,
                backgroundColor: preset.paperColor,
                fontFamily: READER_FONT_STACKS[preset.fontFamily],
                ...getReaderTextureStyle(preset.texture, preset.isDark),
              }}
            >
              阅
            </span>
            <span className="reader-style-preset__meta">
              <strong>{preset.name}</strong>
              <small>{preset.description}</small>
            </span>
          </Button>
        ))}
      </div>

      <div className="reader-style-custom-heading">
        <span>
          <strong>我的自定义</strong>
          <small>修改后自动保存</small>
        </span>
        <Button
          size="small"
          theme="borderless"
          type="tertiary"
          onClick={() => updateCustomStyle(DEFAULT_READER_CUSTOM_STYLE)}
        >
          恢复默认
        </Button>
      </div>

      <Button
        aria-pressed={preferences.theme === 'custom'}
        className={`reader-style-custom-preview${preferences.theme === 'custom' ? ' reader-style-custom-preview--active' : ''}`}
        onClick={() => onChangePreferences({ theme: 'custom' })}
        theme="borderless"
      >
        <span
          className="reader-style-custom-preview__paper"
          style={{
            color: customPreview.textColor,
            backgroundColor: customPreview.paperColor,
            fontFamily: READER_FONT_STACKS[customPreview.fontFamily],
            ...getReaderTextureStyle(customPreview.texture, customPreview.isDark),
          }}
        >
          阅读是一种与自己相处的方式。
        </span>
      </Button>

      <div className="reader-style-controls">
        <label className="reader-style-control">
          <span>字体</span>
          <Select
            aria-label="自定义正文字体"
            size="small"
            value={customStyle.fontFamily}
            onChange={(value) => updateCustomStyle({ fontFamily: value as ReaderFont })}
            renderSelectedItem={(optionNode: Record<string, unknown>) => {
              const font = READER_FONT_OPTIONS.find((option) => option.value === optionNode.value);
              return font ? <FontPreview font={font.value} label={font.label} /> : String(optionNode.label ?? '');
            }}
          >
            {READER_FONT_OPTIONS.map((font) => (
              <Select.Option key={font.value} value={font.value}>
                <FontPreview font={font.value} label={font.label} />
              </Select.Option>
            ))}
          </Select>
        </label>

        <div className="reader-style-control">
          <span>纸张颜色</span>
          <div className="reader-style-color-control">
            <ColorPicker
              alpha={false}
              defaultFormat="hex"
              height={176}
              usePopover
              value={ColorPicker.colorStringToValue(customStyle.paperColor)}
              width={224}
              onChange={(color) => updateCustomStyle({
                paperColor: color.hex.startsWith('#') ? color.hex : `#${color.hex}`,
              })}
              popoverProps={{
                motion: false,
                onVisibleChange: (visible) => setVisibleColorPicker(visible ? 'paper' : null),
                position: 'bottomLeft',
                stopPropagation: true,
                visible: visibleColorPicker === 'paper',
              }}
            >
              <Button
                aria-label={`选择纸张颜色，当前为 ${customStyle.paperColor.toUpperCase()}`}
                className="reader-style-color-trigger"
                size="small"
                theme="borderless"
              >
                <span
                  aria-hidden="true"
                  className="reader-style-color-trigger__sample"
                  style={{ backgroundColor: customStyle.paperColor }}
                />
              </Button>
            </ColorPicker>
            <code>{customStyle.paperColor.toUpperCase()}</code>
          </div>
        </div>

        <div className="reader-style-control">
          <span>字体颜色</span>
          <div className="reader-style-color-control">
            <ColorPicker
              alpha={false}
              defaultFormat="hex"
              height={176}
              usePopover
              value={ColorPicker.colorStringToValue(customStyle.textColor)}
              width={224}
              onChange={(color) => updateCustomStyle({
                textColor: color.hex.startsWith('#') ? color.hex : `#${color.hex}`,
              })}
              popoverProps={{
                motion: false,
                onVisibleChange: (visible) => setVisibleColorPicker(visible ? 'text' : null),
                position: 'bottomLeft',
                stopPropagation: true,
                visible: visibleColorPicker === 'text',
              }}
            >
              <Button
                aria-label={`选择字体颜色，当前为 ${customStyle.textColor.toUpperCase()}`}
                className="reader-style-color-trigger"
                size="small"
                theme="borderless"
              >
                <span
                  aria-hidden="true"
                  className="reader-style-color-trigger__sample"
                  style={{ backgroundColor: customStyle.textColor }}
                />
              </Button>
            </ColorPicker>
            <code>{customStyle.textColor.toUpperCase()}</code>
          </div>
        </div>

        <label className="reader-style-control">
          <span>纸张纹理</span>
          <Select
            aria-label="自定义纸张纹理"
            size="small"
            value={customStyle.texture}
            onChange={(value) => updateCustomStyle({ texture: value as ReaderCustomStyle['texture'] })}
          >
            {READER_TEXTURE_PRESETS.map((texture) => (
              <Select.Option key={texture.id} value={texture.id}>
                {texture.label}
              </Select.Option>
            ))}
          </Select>
        </label>

        <label className="reader-style-control">
          <span>文字大小</span>
          <InputNumber
            aria-label="自定义文字大小"
            min={14}
            max={28}
            size="small"
            suffix="px"
            value={customStyle.fontSize}
            onNumberChange={(fontSize) => updateCustomStyle({ fontSize })}
          />
        </label>

        <label className="reader-style-control">
          <span>松紧程度</span>
          <Select
            aria-label="自定义松紧程度"
            size="small"
            value={customStyle.density}
            onChange={(value) => updateCustomStyle({ density: value as ReaderCustomStyle['density'] })}
          >
            {READER_DENSITY_PRESETS.map((density) => (
              <Select.Option key={density.id} value={density.id}>{density.label}</Select.Option>
            ))}
          </Select>
        </label>
      </div>
    </div>
  );

  return (
    <div className="reader-toolbar">
      <Tooltip content={tocCollapsed ? '展开书籍目录' : '收起书籍目录'}>
        <Button
          aria-label={tocCollapsed ? '展开书籍目录' : '收起书籍目录'}
          icon={<IconSidebar />}
          theme="borderless"
          type="tertiary"
          onClick={onToggleToc}
        />
      </Tooltip>
      <span className="reader-toolbar__divider" />
      <ButtonGroup>
        <Tooltip content="上一页（← / ↑）">
          <Button aria-label="上一页" icon={<IconChevronLeft />} theme="borderless" type="tertiary" onClick={onPrev} />
        </Tooltip>
        <Tooltip content="下一页（→ / ↓）">
          <Button aria-label="下一页" icon={<IconChevronRight />} theme="borderless" type="tertiary" onClick={onNext} />
        </Tooltip>
      </ButtonGroup>
      <span className="reader-toolbar__divider" />
      <Popover
        content={stylePanel}
        contentClassName="reader-style-popover"
        position="bottomLeft"
        showArrow={false}
        trigger="click"
        visible={stylePopoverVisible}
        onVisibleChange={onStylePopoverVisibleChange}
      >
        <Button
          aria-label="打开阅读样式设置"
          icon={<IconColorPalette />}
          theme="borderless"
          type="tertiary"
        >
          {getReaderThemeName(preferences.theme)}
        </Button>
      </Popover>
    </div>
  );
}
