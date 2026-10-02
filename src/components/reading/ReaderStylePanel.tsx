import { Button, ColorPicker, InputNumber, Select } from '@douyinfe/semi-ui';
import { useEffect, useState } from 'react';
import { FontPreview } from './FontPreview';

import {
  ensureReaderFontStylesheet,
  READER_FONT_OPTIONS,
  READER_FONT_STACKS,
} from '../../util/reading/readerFonts';

import type { ReaderCustomStyle, ReaderFont, ReaderPreferences } from '../../../contracts/reading';
import {
  DEFAULT_READER_CUSTOM_STYLE,
  getReaderTextureStyle,
  READER_DENSITY_PRESETS,
  READER_TEXTURE_PRESETS,
  READER_THEME_PRESETS,
  resolveReaderStyle,
} from '../../util/reading/readerThemes';

export interface ReaderStylePanelProps {
  preferences: ReaderPreferences;
  onChangePreferences: (changes: Partial<ReaderPreferences>) => void;
}

export function ReaderStylePanel({ preferences, onChangePreferences }: ReaderStylePanelProps) {
  const [visibleColorPicker, setVisibleColorPicker] = useState<'paper' | 'text' | null>(null);

  useEffect(() => {
    void Promise.all(
      READER_FONT_OPTIONS.map((font) => ensureReaderFontStylesheet(document, font.value)),
    );
  }, []);

  const customStyle = preferences.customStyle;
  const customPreview = resolveReaderStyle({ ...preferences, theme: 'custom' });

  const updateCustomStyle = (changes: Partial<ReaderCustomStyle>) => {
    onChangePreferences({
      theme: 'custom',
      customStyle: { ...customStyle, ...changes },
    });
  };

  const stylePanel = (
    <div
      className="reader-style-panel [width:344px] [max-width:calc(100vw_-_24px)] [max-height:min(620px,_calc(100vh_-_72px))] [padding:12px] [color:var(--semi-color-text-0)] [@media(max-width:480px)]:[width:min(344px,_calc(100vw_-_16px))] [@media(max-width:480px)]:[padding:10px]"
      aria-label="阅读样式设置"
    >
      <div className="reader-style-panel__heading justify-between [margin-bottom:8px]">
        <strong>阅读预设</strong>
        <span>选择后立即应用</span>
      </div>
      <div className="reader-style-presets [grid-template-columns:repeat(2,_minmax(0,_1fr))] [gap:6px]">
        {READER_THEME_PRESETS.map((preset) => (
          <Button
            aria-pressed={preferences.theme === preset.id}
            className={`reader-style-preset${preferences.theme === preset.id ? ' reader-style-preset--active' : ''}`}
            key={preset.id}
            onClick={() => onChangePreferences({ theme: preset.id })}
            theme="borderless"
          >
            <span
              className="reader-style-preset__sample [width:34px] [height:40px] [flex:0_0_34px] [place-items:center]"
              style={{
                color: preset.textColor,
                backgroundColor: preset.paperColor,
                fontFamily: READER_FONT_STACKS[preset.fontFamily],
                ...getReaderTextureStyle(preset.texture, preset.isDark),
              }}
            >
              阅
            </span>
            <span className="reader-style-preset__meta min-w-0 items-start [line-height:1.25]">
              <strong>{preset.name}</strong>
              <small>{preset.description}</small>
            </span>
          </Button>
        ))}
      </div>

      <div className="reader-style-custom-heading justify-between [margin-top:12px] [padding-top:10px] [border-top:1px_solid_var(--semi-color-border)]">
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
          className="reader-style-custom-preview__paper block w-full [padding:10px_12px] [text-align:left]"
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

      <div className="reader-style-controls [gap:7px] [margin-top:10px]">
        <label className="reader-style-control [min-height:32px] [grid-template-columns:72px_minmax(0,_1fr)] [color:var(--semi-color-text-1)]">
          <span>字体</span>
          <Select
            aria-label="自定义正文字体"
            size="small"
            value={customStyle.fontFamily}
            onChange={(value) => updateCustomStyle({ fontFamily: value as ReaderFont })}
            renderSelectedItem={(optionNode: Record<string, unknown>) => {
              const font = READER_FONT_OPTIONS.find((option) => option.value === optionNode.value);
              return font ? (
                <FontPreview font={font.value} label={font.label} />
              ) : (
                String(optionNode.label ?? '')
              );
            }}
          >
            {READER_FONT_OPTIONS.map((font) => (
              <Select.Option key={font.value} value={font.value}>
                <FontPreview font={font.value} label={font.label} />
              </Select.Option>
            ))}
          </Select>
        </label>

        <div className="reader-style-control [min-height:32px] [grid-template-columns:72px_minmax(0,_1fr)] [color:var(--semi-color-text-1)]">
          <span>纸张颜色</span>
          <div className="reader-style-color-control min-w-0">
            <ColorPicker
              alpha={false}
              defaultFormat="hex"
              height={176}
              usePopover
              value={ColorPicker.colorStringToValue(customStyle.paperColor)}
              width={224}
              onChange={(color) =>
                updateCustomStyle({
                  paperColor: color.hex.startsWith('#') ? color.hex : `#${color.hex}`,
                })
              }
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
                  className="reader-style-color-trigger__sample block [width:22px] [height:22px]"
                  style={{ backgroundColor: customStyle.paperColor }}
                />
              </Button>
            </ColorPicker>
            <code>{customStyle.paperColor.toUpperCase()}</code>
          </div>
        </div>

        <div className="reader-style-control [min-height:32px] [grid-template-columns:72px_minmax(0,_1fr)] [color:var(--semi-color-text-1)]">
          <span>字体颜色</span>
          <div className="reader-style-color-control min-w-0">
            <ColorPicker
              alpha={false}
              defaultFormat="hex"
              height={176}
              usePopover
              value={ColorPicker.colorStringToValue(customStyle.textColor)}
              width={224}
              onChange={(color) =>
                updateCustomStyle({
                  textColor: color.hex.startsWith('#') ? color.hex : `#${color.hex}`,
                })
              }
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
                  className="reader-style-color-trigger__sample block [width:22px] [height:22px]"
                  style={{ backgroundColor: customStyle.textColor }}
                />
              </Button>
            </ColorPicker>
            <code>{customStyle.textColor.toUpperCase()}</code>
          </div>
        </div>

        <label className="reader-style-control [min-height:32px] [grid-template-columns:72px_minmax(0,_1fr)] [color:var(--semi-color-text-1)]">
          <span>纸张纹理</span>
          <Select
            aria-label="自定义纸张纹理"
            size="small"
            value={customStyle.texture}
            onChange={(value) =>
              updateCustomStyle({ texture: value as ReaderCustomStyle['texture'] })
            }
          >
            {READER_TEXTURE_PRESETS.map((texture) => (
              <Select.Option key={texture.id} value={texture.id}>
                {texture.label}
              </Select.Option>
            ))}
          </Select>
        </label>

        <label className="reader-style-control [min-height:32px] [grid-template-columns:72px_minmax(0,_1fr)] [color:var(--semi-color-text-1)]">
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

        <label className="reader-style-control [min-height:32px] [grid-template-columns:72px_minmax(0,_1fr)] [color:var(--semi-color-text-1)]">
          <span>松紧程度</span>
          <Select
            aria-label="自定义松紧程度"
            size="small"
            value={customStyle.density}
            onChange={(value) =>
              updateCustomStyle({ density: value as ReaderCustomStyle['density'] })
            }
          >
            {READER_DENSITY_PRESETS.map((density) => (
              <Select.Option key={density.id} value={density.id}>
                {density.label}
              </Select.Option>
            ))}
          </Select>
        </label>
      </div>
    </div>
  );

  return stylePanel;
}
