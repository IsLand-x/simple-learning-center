import type { View as FoliateView } from 'foliate-js/view.js';
import { rangeToViewportRect } from '../../../lib/foliateReader';
import type { ReaderSelection } from '../../../types';
import { hasActiveTextSelection } from './interactionHelpers';

type MutableReaderRef<T> = { current: T };

interface FoliateSelectionReporterOptions {
  isDisposed: () => boolean;
  onSelectionRef: MutableReaderRef<(selection: ReaderSelection | null) => void>;
}

export interface FoliateSelectionReporter {
  reportRange: (
    view: FoliateView,
    index: number,
    sourceRange: Range | null,
    sourceRect?: DOMRect | null,
  ) => void;
  report: (view: FoliateView, doc: Document, index: number) => void;
  clear: (notify?: boolean) => void;
  dispose: () => void;
}

export function createFoliateSelectionReporter({
  isDisposed,
  onSelectionRef,
}: FoliateSelectionReporterOptions): FoliateSelectionReporter {
  let selectionFrame = 0;
  let selectionReportGeneration = 0;

  const reportRange: FoliateSelectionReporter['reportRange'] = (
    view,
    index,
    sourceRange,
    sourceRect,
  ) => {
    window.cancelAnimationFrame(selectionFrame);
    const generation = ++selectionReportGeneration;
    const range = sourceRange?.cloneRange() ?? null;
    const rect = sourceRect
      ? new DOMRect(sourceRect.left, sourceRect.top, sourceRect.width, sourceRect.height)
      : null;
    selectionFrame = window.requestAnimationFrame(() => {
      selectionFrame = 0;
      if (isDisposed() || generation !== selectionReportGeneration) return;
      const selectedText = range?.toString().trim() ?? '';
      if (!range || range.collapsed || !selectedText) {
        onSelectionRef.current(null);
        return;
      }
      try {
        onSelectionRef.current({
          text: selectedText.slice(0, 600),
          cfi: view.getCFI(index, range),
          rect: rect ?? rangeToViewportRect(range),
        });
      } catch {
        onSelectionRef.current(null);
      }
    });
  };

  const clear = (notify = true) => {
    selectionReportGeneration += 1;
    window.cancelAnimationFrame(selectionFrame);
    selectionFrame = 0;
    if (notify) onSelectionRef.current(null);
  };

  const report = (view: FoliateView, doc: Document, index: number) => {
    const selection = doc.defaultView?.getSelection();
    reportRange(view, index, hasActiveTextSelection(selection) ? selection!.getRangeAt(0) : null);
  };

  const dispose = () => {
    selectionReportGeneration += 1;
    window.cancelAnimationFrame(selectionFrame);
    selectionFrame = 0;
  };

  return { reportRange, report, clear, dispose };
}
