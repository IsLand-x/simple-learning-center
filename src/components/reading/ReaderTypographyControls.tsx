import { Button, InputNumber, Select } from '@douyinfe/semi-ui';
import { useId } from 'react';
import type { ReaderFont, ReaderPreferences } from '../../../contracts/reading';
import { READER_FONT_OPTIONS } from '../../util/reading/readerFonts';
import { READER_DENSITY_PRESETS, resolveReaderStyle } from '../../util/reading/readerThemes';
import { FontPreview } from './FontPreview';

export function ReaderTypographyControls({
  preferences,
  onChangePreferences,
}: {
  preferences: ReaderPreferences;
  onChangePreferences: (changes: Partial<ReaderPreferences>) => void;
}) {
  const style = resolveReaderStyle(preferences);
  const labelId = useId();
  return (
    <section aria-label="正文排版" className="mb-4">
      <div className="reader-style-panel__heading justify-between mb-2">
        <strong>正文排版</strong>
        <span>切换纸张时保持不变</span>
      </div>
      <div role="group" aria-label="正文排版预设" className="flex gap-3 py-1.5">
        {[
          { fontFamily: 'source-serif' as const, label: '纸书宋体' },
          { fontFamily: 'sans' as const, label: '清晰黑体' },
        ].map((preset) => {
          const active = style.fontFamily === preset.fontFamily && style.paragraphStyle === 'book';
          return (
            <Button
              key={preset.fontFamily}
              aria-pressed={active}
              className="relative flex-1 after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']"
              theme={active ? 'solid' : 'light'}
              type={active ? 'primary' : 'tertiary'}
              onClick={() =>
                onChangePreferences({
                  fontFamily: preset.fontFamily,
                  fontSize: 20,
                  lineHeight: 1.8,
                  paragraphStyle: 'book',
                })
              }
            >
              {preset.label}
            </Button>
          );
        })}
      </div>
      <div className="reader-style-controls gap-2 mt-2">
        <label className="reader-style-control min-h-8 [grid-template-columns:72px_minmax(0,_1fr)] [color:var(--semi-color-text-1)]">
          <span id={`${labelId}-font`}>字体</span>
          <Select
            aria-labelledby={`${labelId}-font`}
            size="small"
            value={style.fontFamily}
            onChange={(value) => onChangePreferences({ fontFamily: value as ReaderFont })}
            renderSelectedItem={(option: Record<string, unknown>) => {
              const font = READER_FONT_OPTIONS.find((item) => item.value === option.value);
              return font ? (
                <FontPreview font={font.value} label={font.label} />
              ) : (
                String(option.label ?? '')
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
        <label className="reader-style-control min-h-8 [grid-template-columns:72px_minmax(0,_1fr)] [color:var(--semi-color-text-1)]">
          <span>文字大小</span>
          <InputNumber
            aria-label="正文字号"
            size="small"
            min={14}
            max={28}
            suffix="px"
            value={style.fontSize}
            onNumberChange={(fontSize) => onChangePreferences({ fontSize })}
          />
        </label>
        <label className="reader-style-control min-h-8 [grid-template-columns:72px_minmax(0,_1fr)] [color:var(--semi-color-text-1)]">
          <span id={`${labelId}-density`}>松紧程度</span>
          <Select
            aria-labelledby={`${labelId}-density`}
            size="small"
            value={style.density.id}
            onChange={(value) =>
              onChangePreferences({
                lineHeight:
                  READER_DENSITY_PRESETS.find((density) => density.id === value)?.lineHeight ?? 1.8,
              })
            }
          >
            {READER_DENSITY_PRESETS.map((density) => (
              <Select.Option key={density.id} value={density.id}>
                {density.label}
              </Select.Option>
            ))}
          </Select>
        </label>
        <label className="reader-style-control min-h-8 [grid-template-columns:72px_minmax(0,_1fr)] [color:var(--semi-color-text-1)]">
          <span id={`${labelId}-paragraph`}>段落样式</span>
          <Select
            aria-labelledby={`${labelId}-paragraph`}
            size="small"
            value={style.paragraphStyle}
            onChange={(value) =>
              onChangePreferences({ paragraphStyle: value === 'spaced' ? 'spaced' : 'book' })
            }
          >
            <Select.Option value="book">纸书 · 首行缩进</Select.Option>
            <Select.Option value="spaced">段落留白</Select.Option>
          </Select>
        </label>
      </div>
    </section>
  );
}
