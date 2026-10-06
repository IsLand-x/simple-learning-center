import { IconAIStrokedLevel1, IconDeleteStroked, IconEditStroked } from '@douyinfe/semi-icons';
import { Button, TextArea, Tooltip } from '@douyinfe/semi-ui';
import { useEffect, useState } from 'react';
import type { HighlightItem } from '../../../../../../contracts/reading';
import { useLearningStore } from '../../../../../store/useLearningStore';

export function GlossaryTerm({
  term,
  onJump,
  busy,
  error,
  configured,
  onGenerate,
}: {
  term: HighlightItem;
  onJump: (term: HighlightItem) => void;
  busy: boolean;
  error: string;
  configured: boolean;
  onGenerate: () => void;
}) {
  const update = useLearningStore((state) => state.updateHighlight);
  const remove = useLearningStore((state) => state.deleteHighlight);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(term.definition ?? '');
  useEffect(() => {
    if (!editing) setDraft(term.definition ?? '');
  }, [term.definition, editing]);
  const save = () => {
    update(term.id, { definition: draft });
    setEditing(false);
  };
  return (
    <article className="glossary-term min-w-0 [padding:8px_0] [border-bottom:1px_solid_var(--semi-color-border)]">
      <div className="flex min-w-0 items-center [gap:4px]">
        <button
          type="button"
          className="glossary-term__title min-w-0 flex-1 mobile:min-h-[44px] truncate text-left font-semibold [font-size:14px] [color:var(--semi-color-text-0)] [border-radius:var(--semi-border-radius-small)] hover:[color:var(--semi-color-primary)] focus-visible:[outline:2px_solid_var(--semi-color-focus-border)]"
          onClick={() => onJump(term)}
          title={`${term.text} · ${term.chapter} · 定位原文`}
        >
          {term.text}
        </button>
        <span className="inline-flex items-center justify-center mobile:min-w-[44px] mobile:min-h-[44px]">
          <Tooltip content={configured ? '使用当前所选模型生成释义' : '请先在 AI 助手中选择模型'}>
            <Button
              size="small"
              theme="borderless"
              type="tertiary"
              icon={<IconAIStrokedLevel1 />}
              aria-label={`AI 解释 ${term.text}`}
              disabled={!configured || editing}
              loading={busy}
              onClick={onGenerate}
            />
          </Tooltip>
        </span>
        <span className="inline-flex items-center justify-center mobile:min-w-[44px] mobile:min-h-[44px]">
          <Tooltip content="编辑释义">
            <Button
              size="small"
              theme="borderless"
              type="tertiary"
              icon={<IconEditStroked />}
              aria-label={`编辑 ${term.text} 的释义`}
              onClick={() => setEditing(true)}
            />
          </Tooltip>
        </span>
        <span className="inline-flex items-center justify-center mobile:min-w-[44px] mobile:min-h-[44px]">
          <Tooltip content="移出术语表并取消全书标记">
            <Button
              size="small"
              theme="borderless"
              type="danger"
              icon={<IconDeleteStroked />}
              aria-label={`删除术语 ${term.text}`}
              onClick={() => remove(term.id)}
            />
          </Tooltip>
        </span>
      </div>
      {editing ? (
        <div className="[margin-top:6px]">
          <label
            className="block [margin-bottom:4px] [font-size:12px] [color:var(--semi-color-text-2)]"
            htmlFor={`term-definition-${term.id}`}
          >
            术语释义
          </label>
          <TextArea
            id={`term-definition-${term.id}`}
            value={draft}
            onChange={setDraft}
            autosize={{ minRows: 2, maxRows: 6 }}
            placeholder="填写术语含义"
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault();
                save();
              }
              if (event.key === 'Escape') {
                event.stopPropagation();
                setEditing(false);
              }
            }}
          />
          <div className="flex justify-end [gap:4px] mobile:[gap:16px] [margin-top:4px]">
            <Button
              size="small"
              theme="borderless"
              type="tertiary"
              onClick={() => setEditing(false)}
            >
              取消
            </Button>
            <span className="inline-flex items-center justify-center mobile:min-w-[44px] mobile:min-h-[44px]">
              <Tooltip content="保存（Cmd/Ctrl + Enter）">
                <Button size="small" theme="solid" onClick={save}>
                  保存
                </Button>
              </Tooltip>
            </span>
          </div>
        </div>
      ) : (
        <p className="[margin:4px_0_0] whitespace-pre-wrap break-words [font-size:13px] [line-height:1.5] [color:var(--semi-color-text-1)]">
          {term.definition || (busy ? '正在生成释义…' : '暂无释义')}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="[margin:4px_0_0] break-words [font-size:12px] [color:var(--semi-color-danger)]"
        >
          {error}
        </p>
      )}
    </article>
  );
}
