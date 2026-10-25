import { Select } from '@douyinfe/semi-ui';
import { useMemo } from 'react';
import type { chapterEntries } from './AssistantPanel/chapterIndex';

export function ChapterSelect({
  chapters,
  value,
  includeBook = false,
  id,
  label,
  labelledBy,
  className,
  disabled,
  onChange,
}: {
  chapters: ReturnType<typeof chapterEntries>;
  value: string | undefined;
  includeBook?: boolean;
  id: string;
  label: string;
  labelledBy?: string;
  className?: string;
  disabled?: boolean;
  onChange: (chapterId: string | undefined) => void;
}) {
  const options = useMemo(
    () => [
      ...(includeBook ? [{ key: 'book', value: 'book', label: <span>全书导读</span> }] : []),
      ...chapters.map((chapter) => ({
        key: chapter.id,
        value: `chapter:${chapter.id}`,
        // Semi 2.x also keys its selection map by label. Distinct React nodes
        // keep repeated chapter titles independent without changing stored IDs.
        label: (
          <span className="block min-w-0 truncate">
            {'　'.repeat(chapter.path.length - 1)}
            {chapter.label}
            {includeBook && '（含小节）'}
          </span>
        ),
      })),
    ],
    [chapters, includeBook],
  );
  return (
    <Select
      id={id}
      aria-label={label}
      aria-labelledby={labelledBy}
      className={className}
      value={value === undefined ? (includeBook ? 'book' : undefined) : `chapter:${value}`}
      disabled={disabled}
      optionList={options}
      onChange={(selected) => {
        if (typeof selected === 'string')
          onChange(selected === 'book' ? undefined : selected.slice('chapter:'.length));
      }}
    />
  );
}
